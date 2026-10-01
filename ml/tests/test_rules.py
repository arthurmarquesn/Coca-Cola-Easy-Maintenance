from __future__ import annotations

import unittest

from ml.rules import (
    classify_by_rule,
)


class SemanticRulesTest(
    unittest.TestCase,
):
    def assert_rule(
        self,
        observation: str,
        expected_mode: str,
        expected_component: str,
        equipment: str = "",
    ) -> None:
        result = classify_by_rule(
            {
                "observation":
                    observation,

                "equipment":
                    equipment,
            },
        )

        self.assertIsNotNone(
            result,
        )

        assert result is not None

        self.assertEqual(
            result.failure_mode,
            expected_mode,
        )

        self.assertEqual(
            result.failed_component_code,
            expected_component,
        )

    def test_corte_filme(
        self,
    ) -> None:
        self.assert_rule(
            "FALHA NO CORTE DO FILME ORDEM 30008863270",
            "Falha de corte de filme",
            "SISTEMA_CORTE_FILME",
        )

    def test_corte_filme_resistencia(
        self,
    ) -> None:
        self.assert_rule(
            "QUEBRA DA RESISTENCIA DO CORTE DO FILME",
            "Falha de corte de filme",
            "RESISTENCIA_CORTE_FILME",
        )

    def test_colapso_latas(
        self,
    ) -> None:
        self.assert_rule(
            "VELOCIDADE REDUZIDA, COLAPSO DE LATAS",
            "Colapso de latas",
            "RECRAVADORA",
            "RECRAVADORA 708 G FRR LI04",
        )

    def test_amassamento_latas(
        self,
    ) -> None:
        self.assert_rule(
            "INVESTIGAÇÃO NA RECRAVADORA (AMASSANDO LATAS)",
            "Amassamento de latas",
            "RECRAVADORA",
            "RECRAVADORA 708 G FRR LI04",
        )

    def test_patinamento_esteira(
        self,
    ) -> None:
        self.assert_rule(
            "ESTEIRA PATINANDO ORDEM 30008863292",
            "Patinamento de esteira",
            "ESTEIRA",
        )

    def test_patinamento_rolete(
        self,
    ) -> None:
        self.assert_rule(
            "ROLETE PATINANDO NA VIA DE ENTRADA",
            "Patinamento de rolete",
            "ROLETE",
        )

    def test_patinamento_lona(
        self,
    ) -> None:
        self.assert_rule(
            "LONA DA MESA DE ENVOLVIMENTO PATINANDO",
            "Patinamento de lona",
            "LONA",
        )

    def test_quebra_esteira(
        self,
    ) -> None:
        self.assert_rule(
            "QUEBRA DA ESTEIRA DA CURVA",
            "Quebra de esteira",
            "ESTEIRA",
        )

    def test_nao_confundir_rolamento_com_esteira(
        self,
    ) -> None:
        result = classify_by_rule(
            {
                "observation":
                    "QUEBROU ROLAMENTOS DA ESTEIRA DE SAIDA DO FORNO",
            },
        )

        self.assertIsNone(
            result,
        )

    def test_rompimento_cabo(
        self,
    ) -> None:
        self.assert_rule(
            "ROMPIMENTO DO CABO DO SENSOR DE RECUO",
            "Rompimento de cabo",
            "CABO",
        )

    def test_queima_inversor(
        self,
    ) -> None:
        self.assert_rule(
            "INVERSOR PALETIZADORA QUEIMADO",
            "Queima de inversor",
            "INVERSOR",
        )

    def test_recravacao(
        self,
    ) -> None:
        self.assert_rule(
            "AJUSTE NA RECRAVAÇÃO (TECNICOS FERRUM)",
            "Falha de recravação",
            "RECRAVADORA",
        )

    def test_nome_do_equipamento_sozinho_nao_dispara_regra(
        self,
    ) -> None:
        result = classify_by_rule(
            {
                "observation":
                    "SETUP DO EQUIPAMENTO",

                "equipment":
                    "RECRAVADORA 708 G FRR LI04",
            },
        )

        self.assertIsNone(
            result,
        )


if __name__ == "__main__":
    unittest.main()