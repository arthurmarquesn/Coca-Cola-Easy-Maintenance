from __future__ import annotations

import os
from collections import Counter

import pymysql
from dotenv import load_dotenv

from ml.rules import (
    classify_by_rule,
)


def main() -> None:
    load_dotenv(
        ".env.local",
    )

    connection = (
        pymysql.connect(
            host=os.getenv(
                "DB_HOST",
                "127.0.0.1",
            ),
            port=int(
                os.getenv(
                    "DB_PORT",
                    "3306",
                ),
            ),
            user=os.getenv(
                "DB_USER",
            ),
            password=os.getenv(
                "DB_PASSWORD",
            ),
            database=os.getenv(
                "DB_NAME",
                "coca_cola_maintenance",
            ),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
    )

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    me.id,
                    me.source_line_name,
                    me.source_equipment_name,
                    me.source_stop_key_1,
                    me.source_stop_subkey,
                    me.observation,
                    me.downtime_minutes,

                    cs.failure_mode
                        AS current_failure_mode,

                    cs.failed_component_code
                        AS current_component

                FROM maintenance_events me

                LEFT JOIN
                    classification_suggestions cs
                    ON cs.id = (
                        SELECT
                            MAX(cs2.id)
                        FROM
                            classification_suggestions cs2
                        WHERE
                            cs2.event_id = me.id
                            AND cs2.model_type = 'ML'
                    )

                ORDER BY
                    me.id
                """
            )

            rows = cursor.fetchall()

        matches = []
        by_rule = Counter()
        changed = 0

        for row in rows:
            prediction = (
                classify_by_rule(
                    {
                        "observation":
                            row.get(
                                "observation",
                            ),

                        "equipment":
                            row.get(
                                "source_equipment_name",
                            ),

                        "stop_key_1":
                            row.get(
                                "source_stop_key_1",
                            ),

                        "stop_subkey":
                            row.get(
                                "source_stop_subkey",
                            ),

                        "line":
                            row.get(
                                "source_line_name",
                            ),
                    },
                )
            )

            if prediction is None:
                continue

            matches.append(
                (
                    row,
                    prediction,
                ),
            )

            by_rule[
                prediction.rule_id
            ] += 1

            current = (
                row.get(
                    "current_failure_mode",
                )
                or ""
            ).strip()

            if (
                current.casefold()
                !=
                prediction.failure_mode.casefold()
            ):
                changed += 1

        print(
            "=" * 72,
        )

        print(
            "EASY MAINTENANCE - VALIDACAO DAS REGRAS SEMANTICAS v1",
        )

        print(
            "=" * 72,
        )

        print(
            f"Eventos no banco: {len(rows)}",
        )

        print(
            f"Eventos cobertos por regra explícita: {len(matches)}",
        )

        coverage = (
            (
                len(matches)
                /
                len(rows)
                *
                100
            )
            if rows
            else 0
        )

        print(
            f"Cobertura: {coverage:.2f}%",
        )

        print(
            f"Classificações que mudariam: {changed}",
        )

        print()

        print(
            "POR REGRA",
        )

        print(
            "-" * 72,
        )

        for (
            rule_id,
            total,
        ) in by_rule.most_common():
            print(
                f"{rule_id:<36} {total:>6}",
            )

        print()

        print(
            "AMOSTRA DE ALTERACOES",
        )

        print(
            "-" * 72,
        )

        shown = 0

        for (
            row,
            prediction,
        ) in matches:
            current = (
                row.get(
                    "current_failure_mode",
                )
                or ""
            ).strip()

            if (
                current.casefold()
                ==
                prediction.failure_mode.casefold()
            ):
                continue

            print(
                f"Evento #{row['id']}",
            )

            print(
                f"Equipamento: {row.get('source_equipment_name') or '-'}",
            )

            print(
                f"Ocorrência: {row.get('observation') or '-'}",
            )

            print(
                f"Atual: {current or 'Não classificado'}",
            )

            print(
                f"Nova: {prediction.failure_mode}",
            )

            print(
                f"Componente: {prediction.failed_component_code}",
            )

            print(
                f"Regra: {prediction.rule_id}",
            )

            print(
                "-" * 72,
            )

            shown += 1

            if shown >= 20:
                break

        print()

        print(
            "Nenhum dado foi alterado no banco.",
        )

    finally:
        connection.close()


if __name__ == "__main__":
    main()