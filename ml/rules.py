from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from typing import Any, Mapping


RULES_VERSION = "rules-v3"


@dataclass(frozen=True)
class EventContext:
    observation: str = ""
    equipment: str = ""
    stop_key_1: str = ""
    stop_subkey: str = ""
    line: str = ""

    @classmethod
    def from_mapping(
        cls,
        value: Mapping[str, Any],
    ) -> "EventContext":
        """
        Aceita tanto os nomes usados pelo backend/ML quanto nomes
        próximos dos campos do banco.
        """

        def first_text(
            *keys: str,
        ) -> str:
            for key in keys:
                candidate = value.get(key)

                if candidate is not None:
                    text = str(candidate).strip()

                    if text:
                        return text

            return ""

        return cls(
            observation=first_text(
                "observation",
                "occurrence",
                "ocorrencia",
                "description",
                "descricao",
            ),
            equipment=first_text(
                "equipment",
                "source_equipment_name",
                "equipment_name",
                "equipamento",
            ),
            stop_key_1=first_text(
                "stop_key_1",
                "source_stop_key_1",
                "chave_1",
            ),
            stop_subkey=first_text(
                "stop_subkey",
                "source_stop_subkey",
                "subchave",
            ),
            line=first_text(
                "line",
                "source_line_name",
                "linha",
            ),
        )


@dataclass(frozen=True)
class RulePrediction:
    failed_component_code: str
    failure_mode: str
    confidence: float
    rule_id: str
    evidence: str

    def as_dict(
        self,
    ) -> dict[str, Any]:
        return asdict(self)


def normalize_text(
    value: object,
) -> str:
    text = (
        ""
        if value is None
        else str(value)
    )

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character,
        )
    )

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def _contains(
    text: str,
    pattern: str,
) -> bool:
    return (
        re.search(
            pattern,
            text,
        )
        is not None
    )


def _prediction(
    *,
    component: str,
    failure_mode: str,
    rule_id: str,
    evidence: str,
    confidence: float = 0.995,
) -> RulePrediction:
    return RulePrediction(
        failed_component_code=component,
        failure_mode=failure_mode,
        confidence=confidence,
        rule_id=rule_id,
        evidence=evidence,
    )


def _component_for_film_cut(
    occurrence: str,
) -> str:
    if "RESISTENCIA" in occurrence:
        return "RESISTENCIA_CORTE_FILME"

    if "FACA" in occurrence:
        return "FACA_CORTE_FILME"

    if "ROLO" in occurrence:
        return "ROLO_CORTE_FILME"

    return "SISTEMA_CORTE_FILME"


def _component_for_can_process(
    equipment: str,
) -> str:
    if "RECRAV" in equipment:
        return "RECRAVADORA"

    if "INSPETOR" in equipment:
        return "INSPETOR_LATAS"

    return "PROCESSO_LATAS"


def _has_explicit_break_mechanism(
    occurrence: str,
) -> bool:
    """
    Evita transformar um mecanismo mecânico explícito em uma
    categoria funcional mais ampla.

    Exemplo:
    "QUEBRA DA RESISTENCIA DO CORTE DO FILME"
    não deve virar automaticamente
    "FALHA DE CORTE DE FILME".
    """

    return _contains(
        occurrence,
        (
            r"\bQUEBR(?:A|OU|ADO|ADA|ADOS|ADAS)\b"
            r"|\bROMPIMENTO\b"
            r"|\bROMPID(?:O|A|OS|AS)\b"
        ),
    )


def _has_inspection_or_rejection_context(
    occurrence: str,
) -> bool:
    """
    Evita interpretar a condição do produto como modo de falha
    quando o texto indica problema de inspeção/rejeição.

    Exemplo:
    "PASSANDO LATAS AMASSADAS SEM REJEITAR"
    deve seguir para o ML em vez de ser forçado para
    "AMASSAMENTO DE LATAS".
    """

    return _contains(
        occurrence,
        r"\bREJEIT\w*\b|\bINSPE\w*\b",
    )


def _has_explicit_chain_break_expression(
    occurrence: str,
) -> bool:
    """
    Reconhece quebra/rompimento quando o mecanismo está
    explicitamente ligado à CORRENTE mecânica.

    A expressão precisa apontar para a própria corrente.
    Isso evita capturar frases como:
    "quebrou o parafuso que segura a corrente".
    """

    return _contains(
        occurrence,
        (
            r"\b(?:QUEBRA|ROMPIMENTO)\s+(?:DO|DA|DE)\s+CORRENTE\b"
            r"|\b(?:QUEBROU|ROMPEU)\s+(?:A\s+)?CORRENTE\b"
            r"|\bCORRENTE\b.{0,24}\b(?:QUEBRAD[AO]|ROMPID[AO])\b"
        ),
    )


def _has_mechanical_chain_context(
    occurrence: str,
) -> bool:
    """
    Exige contexto mecânico e rejeita usos claramente elétricos
    da palavra CORRENTE.

    Exemplos mecânicos:
    - corrente da esteira;
    - corrente do virador de palete;
    - corrente de arraste;
    - corrente do magazine.

    Exemplo elétrico que NÃO deve entrar:
    - passagem de corrente para a embreagem.
    """

    electrical_context = _contains(
        occurrence,
        (
            r"\bCORRENTE\s+ELETRICA\b"
            r"|\bPASSAGEM\s+DE\s+CORRENTE\b"
            r"|\bALIMENTACAO\s+ELETRICA\b"
            r"|\bFALHA\s+ELETRICA\b"
            r"|\bTENSAO\b"
            r"|\bENERGIA\b"
        ),
    )

    if electrical_context:
        return False

    return _contains(
        occurrence,
        (
            r"\bESTEIRA\b"
            r"|\bTRANSPORT\w*\b"
            r"|\bMOTOR\b"
            r"|\bVIRADOR\b"
            r"|\bPALET(?:E|ES)?\b"
            r"|\bPALLET(?:S)?\b"
            r"|\bMAGAZINE\b"
            r"|\bELEVACAO\b"
            r"|\bARRASTE\b"
            r"|\bACIONAMENTO\b"
            r"|\bENGRENAGEM\b"
            r"|\bPINHAO\b"
        ),
    )


def classify_by_rule(
    event: Mapping[str, Any] | EventContext,
) -> RulePrediction | None:
    """
    Camada semântica determinística e conservadora.

    Regras v3:
    - a observação continua sendo a principal fonte;
    - somente rótulos compatíveis com a taxonomia humana atual
      são emitidos;
    - mecanismos sem rótulo canônico equivalente deixam de ser
      forçados por regra e seguem para o classificador ML;
    - sintomas que podem representar outro mecanismo principal
      também seguem para o ML.

    A camada de regras NÃO substitui o classificador ML.
    Ela captura apenas modos de falha explicitamente descritos
    e semanticamente inequívocos.
    """

    context = (
        event
        if isinstance(
            event,
            EventContext,
        )
        else EventContext.from_mapping(
            event,
        )
    )

    occurrence = normalize_text(
        context.observation,
    )

    equipment = normalize_text(
        context.equipment,
    )

    if not occurrence:
        return None

    # ---------------------------------------------------------
    # 1. CORTE DE FILME
    #
    # Mantém apenas ocorrências funcionais explícitas.
    # Se houver QUEBRA/ROMPIMENTO explícito, deixamos o ML
    # escolher o modo de falha específico.
    # ---------------------------------------------------------

    has_film_cut_expression = (
        _contains(
            occurrence,
            r"\bCORTE\s+(?:DO|DE|NO)\s+FILME\b",
        )
        or _contains(
            occurrence,
            r"\bFILME\b.{0,45}\bCORT(?:E|AR|ANDO|OU)\b",
        )
        or _contains(
            occurrence,
            r"\bSISTEMA\s+DE\s+ENVOLVIMENTO\s+E\s+CORTE\s+DE\s+FILME\b",
        )
    )

    if (
        has_film_cut_expression
        and not _has_explicit_break_mechanism(
            occurrence,
        )
    ):
        return _prediction(
            component=_component_for_film_cut(
                occurrence,
            ),
            failure_mode="FALHA DE CORTE DE FILME",
            rule_id="FM_CORTE_FILME",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 2. COLAPSO DE LATAS
    # ---------------------------------------------------------

    if _contains(
        occurrence,
        r"\bCOLAPSO\s+(?:DE\s+)?LATAS?\b",
    ):
        return _prediction(
            component=_component_for_can_process(
                equipment,
            ),
            failure_mode="COLAPSO DE LATAS",
            rule_id="FM_COLAPSO_LATAS",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 3. AMASSAMENTO DE LATAS
    #
    # Não força AMASSAMENTO quando o texto indica que o problema
    # principal pode ser inspeção/rejeição.
    # ---------------------------------------------------------

    has_can_crushing_expression = (
        _contains(
            occurrence,
            r"\bAMASSANDO\s+LATAS?\b",
        )
        or _contains(
            occurrence,
            r"\bLATAS?\s+AMASSAD(?:A|AS|O|OS)\b",
        )
        or _contains(
            occurrence,
            r"\bAMASSAMENTO\s+(?:DE\s+)?LATAS?\b",
        )
    )

    if (
        has_can_crushing_expression
        and not _has_inspection_or_rejection_context(
            occurrence,
        )
    ):
        return _prediction(
            component=_component_for_can_process(
                equipment,
            ),
            failure_mode="AMASSAMENTO DE LATAS",
            rule_id="FM_AMASSAMENTO_LATAS",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 4. PATINAMENTO
    #
    # Somente modos que existem exatamente na taxonomia humana
    # atual permanecem determinísticos.
    #
    # PATINAMENTO DE LONA e PATINAMENTO DE CORREIA foram
    # removidos da camada de regras porque não possuem rótulo
    # canônico equivalente no dataset supervisionado atual.
    # ---------------------------------------------------------

    patinamento_objects = (
        (
            "ESTEIRA",
            "ESTEIRA",
            "PATINAMENTO DE ESTEIRA",
            "FM_PATINAMENTO_ESTEIRA",
        ),
        (
            "ROLETES",
            "ROLETE",
            "PATINAMENTO DE ROLETE",
            "FM_PATINAMENTO_ROLETE",
        ),
        (
            "ROLETE",
            "ROLETE",
            "PATINAMENTO DE ROLETE",
            "FM_PATINAMENTO_ROLETE",
        ),
    )

    if _contains(
        occurrence,
        r"\bPATIN(?:ANDO|AMENTO|A)\b",
    ):
        for (
            token,
            component,
            failure_mode,
            rule_id,
        ) in patinamento_objects:
            if token in occurrence:
                return _prediction(
                    component=component,
                    failure_mode=failure_mode,
                    rule_id=rule_id,
                    evidence=context.observation,
                )

    # ---------------------------------------------------------
    # 5. QUEBRA DA ESTEIRA
    #
    # Não captura "quebrou rolamento da esteira".
    # ---------------------------------------------------------

    if (
        _contains(
            occurrence,
            r"\bQUEBRA\s+DA\s+ESTEIRA\b",
        )
        or _contains(
            occurrence,
            r"\bQUEBROU\s+(?:A\s+)?ESTEIRA\b",
        )
        or _contains(
            occurrence,
            r"\bESTEIRA\s+QUEBRAD(?:A|O)\b",
        )
        or _contains(
            occurrence,
            r"\bESTEIRA\b.{0,18}\bQUEBROU\b",
        )
    ):
        return _prediction(
            component="ESTEIRA",
            failure_mode="QUEBRA DE ESTEIRA",
            rule_id="FM_QUEBRA_ESTEIRA",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 6. QUEBRA / ROMPIMENTO DE CORRENTE MECÂNICA
    #
    # A auditoria da taxonomia confirmou que existe um rótulo
    # canônico humano específico:
    #
    #     QUEBRA DE CORRENTE
    #
    # "ROMPIMENTO DA CORRENTE" é tratado como o mesmo mecanismo
    # canônico quando o texto deixa claro que se trata de uma
    # corrente mecânica.
    #
    # A regra é propositalmente estreita:
    # - a ruptura precisa estar sintaticamente ligada à CORRENTE;
    # - deve existir contexto mecânico;
    # - usos elétricos da palavra CORRENTE são excluídos.
    # ---------------------------------------------------------

    if (
        _has_explicit_chain_break_expression(
            occurrence,
        )
        and _has_mechanical_chain_context(
            occurrence,
        )
    ):
        return _prediction(
            component="CORRENTE",
            failure_mode="QUEBRA DE CORRENTE",
            rule_id="FM_QUEBRA_CORRENTE",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 7. ROMPIMENTO DE MANGUEIRA
    # ---------------------------------------------------------

    if _contains(
        occurrence,
        (
            r"\bROMPIMENTO\s+(?:DO|DE|DA)\s+MANGUEIRA\b"
            r"|\bMANGUEIRA\s+ROMPID[AO]\b"
        ),
    ):
        return _prediction(
            component="MANGUEIRA",
            failure_mode="ROMPIMENTO DE MANGUEIRA",
            rule_id="FM_ROMPIMENTO_MANGUEIRA",
            evidence=context.observation,
        )

    # ---------------------------------------------------------
    # 8. QUEIMAS EXPLÍCITAS
    #
    # Mantemos somente rótulos canônicos cuja equivalência
    # semântica é direta:
    #
    # - QUEIMA DE FILAMENTO
    # - ATUAÇÃO/QUEIMA DE FUSÍVEL
    # - QUEIMA DA PLACA DEVICENET, apenas quando DEVICENET
    #   aparece explicitamente.
    #
    # Inversor, motor, bomba, cartão etc. seguem para o ML,
    # pois a taxonomia humana atual usa classes mais amplas
    # ou diferentes.
    # ---------------------------------------------------------

    has_burn_expression = _contains(
        occurrence,
        r"\bQUEIM(?:A|OU|ADO|ADA|ADOS|ADAS)\b",
    )

    if has_burn_expression:
        if "FILAMENTO" in occurrence:
            return _prediction(
                component="FILAMENTO",
                failure_mode="QUEIMA DE FILAMENTO",
                rule_id="FM_QUEIMA_FILAMENTO",
                evidence=context.observation,
            )

        if "FUSIVEL" in occurrence:
            return _prediction(
                component="FUSIVEL",
                failure_mode="ATUAÇÃO/QUEIMA DE FUSÍVEL",
                rule_id="FM_QUEIMA_FUSIVEL",
                evidence=context.observation,
            )

        if (
            "PLACA" in occurrence
            and "DEVICENET" in occurrence
        ):
            return _prediction(
                component="PLACA_DEVICENET",
                failure_mode="QUEIMA DA PLACA DEVICENET",
                rule_id="FM_QUEIMA_PLACA_DEVICENET",
                evidence=context.observation,
            )

    # ---------------------------------------------------------
    # 9. RECRAVAÇÃO
    #
    # Apenas falha explicitamente descrita permanece
    # determinística.
    #
    # "AJUSTE NA RECRAVAÇÃO" deixa de ser convertido
    # automaticamente em falha e segue para o ML.
    # ---------------------------------------------------------

    if _contains(
        occurrence,
        r"\bFALHA\s+(?:DE|NA)\s+RECRAVACAO\b",
    ):
        return _prediction(
            component="RECRAVADORA",
            failure_mode="FALHA DE RECRAVAÇÃO",
            rule_id="FM_RECRAVACAO",
            evidence=context.observation,
            confidence=0.985,
        )

    # ---------------------------------------------------------
    # MODOS REMOVIDOS DA CAMADA DETERMINÍSTICA V3
    #
    # - PATINAMENTO DE LONA
    # - PATINAMENTO DE CORREIA
    # - ROMPIMENTO DE CABO
    # - ROMPIMENTO DE CORREIA
    # - QUEIMA DE INVERSOR
    # - QUEIMA DE MOTOR
    # - QUEIMA DE BOMBA
    # - QUEIMA DE PLACA genérica
    # - QUEIMA DE CARTÃO ELETRÔNICO
    # - VAZAMENTO DE SELO MECÂNICO
    # - ENTUPIMENTO DE FILTRO
    #
    # Motivo:
    # não existe rótulo canônico equivalente na taxonomia
    # humana atual, ou o mapeamento exigiria perder a diferença
    # semântica entre mecanismos.
    # ---------------------------------------------------------

    return None


def rule_debug_payload(
    prediction: RulePrediction | None,
) -> dict[str, Any] | None:
    """
    Metadado técnico interno.
    Não precisa ser exposto na interface.
    """

    if prediction is None:
        return None

    return {
        "source": "RULE",
        "rulesVersion": RULES_VERSION,
        "ruleId": prediction.rule_id,
        "evidence": prediction.evidence,
    }