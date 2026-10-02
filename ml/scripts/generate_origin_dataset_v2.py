from __future__ import annotations

import argparse
import csv
import random
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


RANDOM_SEED = 20260919
ROWS_PER_SCENARIO = 10
DEFAULT_OUTPUT = Path("ml/data/origin/synthetic_origin_v2.csv")
ORIGINS = ("MANUTENCAO", "OPERACAO")
FEATURE_COLUMNS = (
    "observation", "equipment", "stop_type", "stop_key_1", "stop_subkey", "line",
    "failed_component_code", "failure_mode",
)


@dataclass(frozen=True)
class CausalFamily:
    name: str
    origin: str
    hard_negative_type: str
    causes: tuple[str, ...]


MAINTENANCE = (
    CausalFamily("MECHANICAL_WEAR", "MANUTENCAO", "MISALIGNMENT", ("desgaste progressivo", "superfície consumida pelo uso", "desgaste acima do limite", "degradação mecânica")),
    CausalFamily("MECHANICAL_BREAKAGE", "MANUTENCAO", "OUT_OF_POSITION", ("quebra do suporte", "elemento mecânico quebrado", "fratura da peça", "ruptura estrutural")),
    CausalFamily("RUPTURE", "MANUTENCAO", "NO_ACTUATION", ("mangueira rompida", "cabo rompido", "membrana rasgada", "conexão partida")),
    CausalFamily("LEAKAGE", "MANUTENCAO", "LOW_FLOW", ("vedação danificada com vazamento", "conexão perdeu estanqueidade", "junta deteriorada", "fuga pelo corpo trincado")),
    CausalFamily("ELECTRICAL_FAILURE", "MANUTENCAO", "INTERMITTENT_STOP", ("curto no circuito", "bobina queimada", "isolação elétrica danificada", "terminal elétrico carbonizado")),
    CausalFamily("SIGNAL_FAILURE", "MANUTENCAO", "NO_SIGNAL", ("cabo de sinal danificado", "conector com mau contato", "placa eletrônica defeituosa", "sensor com defeito interno")),
    CausalFamily("BEARING_FAILURE", "MANUTENCAO", "OVERLOAD", ("rolamento travado", "rolamento com pista danificada", "mancal deteriorado", "rolamento sem condição de giro")),
    CausalFamily("DRIVE_FAILURE", "MANUTENCAO", "WRONG_SPEED", ("acionamento com defeito interno", "transmissão danificada", "acoplamento sem tração", "inversor com falha de hardware")),
    CausalFamily("PNEUMATIC_FAILURE", "MANUTENCAO", "SLOW_MOVEMENT", ("atuador pneumático danificado", "mangueira de ar furada", "conjunto pneumático com defeito", "êmbolo com desgaste")),
    CausalFamily("SEAL_FAILURE", "MANUTENCAO", "PRODUCT_LOSS", ("retentor danificado", "gaxeta deteriorada", "anel de vedação rompido", "selo mecânico gasto")),
    CausalFamily("MECHANICAL_CLEARANCE", "MANUTENCAO", "POSITION_DRIFT", ("folga no eixo", "bucha com folga excessiva", "fixação mecânica frouxa", "encaixe gasto")),
    CausalFamily("HARDWARE_FAILURE", "MANUTENCAO", "COMMAND_FAILURE", ("módulo eletrônico queimado", "controlador com defeito", "placa de comando avariada", "fonte eletrônica danificada")),
    CausalFamily("OVERHEATING", "MANUTENCAO", "THERMAL_ALARM", ("ventilador de refrigeração quebrado", "dissipador obstruído por falha física", "isolação degradada pelo calor", "rolamento aquecendo por dano")),
    CausalFamily("STRUCTURAL_DAMAGE", "MANUTENCAO", "VIBRATION", ("base trincada", "estrutura deformada", "solda rompida", "suporte estrutural danificado")),
    CausalFamily("BLOCKAGE_BY_FAILURE", "MANUTENCAO", "BLOCKAGE", ("peça quebrada bloqueando a passagem", "componente deformado causando obstrução", "fragmento mecânico travando o conjunto", "mecanismo avariado impedindo o fluxo")),
    CausalFamily("COMPONENT_DEGRADATION", "MANUTENCAO", "LOW_PERFORMANCE", ("componente degradado pelo tempo", "fadiga do material", "vida útil esgotada", "deterioração física acumulada")),
)

OPERATION = (
    CausalFamily("BAD_SETUP", "OPERACAO", "MISALIGNMENT", ("setup executado fora do padrão", "ajuste inicial incorreto", "preparação da máquina incompleta", "setup carregado para outro formato")),
    CausalFamily("BAD_ADJUSTMENT", "OPERACAO", "OUT_OF_POSITION", ("regulagem feita na posição errada", "ajuste operacional incorreto", "regulagem excessivamente aberta", "calibração operacional inadequada")),
    CausalFamily("POSITIONING_ERROR", "OPERACAO", "NO_ACTUATION", ("produto colocado fora de posição", "embalagem posicionada incorretamente", "material entrou desalinhado", "peça alimentada na orientação errada")),
    CausalFamily("WRONG_RECIPE", "OPERACAO", "LOW_FLOW", ("receita de outro produto selecionada", "receita carregada com valor incorreto", "programa de formato errado", "receita incompatível com a produção")),
    CausalFamily("WRONG_PARAMETER", "OPERACAO", "INTERMITTENT_STOP", ("parâmetro digitado incorretamente", "limite configurado fora do padrão", "temporização ajustada errada", "valor operacional alterado indevidamente")),
    CausalFamily("WRONG_REFERENCE", "OPERACAO", "NO_SIGNAL", ("referência selecionada incorretamente", "ponto de referência informado errado", "zero operacional definido fora da posição", "referência de formato trocada")),
    CausalFamily("EXCESS_FEED", "OPERACAO", "OVERLOAD", ("excesso de produto na alimentação", "entrada acima da capacidade", "acúmulo causado por alimentação excessiva", "volume de produto acima do previsto")),
    CausalFamily("WRONG_SPEED_SETTING", "OPERACAO", "WRONG_SPEED", ("velocidade configurada incorretamente", "referência de velocidade acima do padrão", "cadência ajustada para valor errado", "sincronismo de velocidade mal configurado")),
    CausalFamily("INADEQUATE_FLOW", "OPERACAO", "SLOW_MOVEMENT", ("fluxo de processo ajustado abaixo do necessário", "vazão operacional inadequada", "alimentação de produto irregular", "restrição criada pelo ajuste do processo")),
    CausalFamily("WRONG_PROCEDURE", "OPERACAO", "PRODUCT_LOSS", ("procedimento de trabalho não foi seguido", "etapa manual executada incorretamente", "sequência do processo ignorada", "rotina produtiva aplicada de forma errada")),
    CausalFamily("FORMAT_CHANGE_ERROR", "OPERACAO", "POSITION_DRIFT", ("troca de formato deixou o conjunto fora de posição", "peça de formato montada na referência errada", "conversão de formato incompleta", "ajuste pós troca de formato não realizado")),
    CausalFamily("WRONG_SEQUENCE", "OPERACAO", "COMMAND_FAILURE", ("comando enviado fora da sequência", "etapas acionadas na ordem incorreta", "ciclo iniciado antes da liberação", "sequência automática selecionada errada")),
    CausalFamily("STARTUP_PROCEDURE_ERROR", "OPERACAO", "THERMAL_ALARM", ("partida realizada sem estabilização do processo", "aquecimento inicial interrompido cedo", "equipamento iniciado fora da sequência", "liberação de partida feita antes da condição")),
    CausalFamily("HANDLING_ERROR", "OPERACAO", "VIBRATION", ("produto manuseado de forma inadequada", "carga distribuída incorretamente", "material apoiado fora da guia", "intervenção manual deslocou o conjunto")),
    CausalFamily("PRODUCT_ACCUMULATION", "OPERACAO", "BLOCKAGE", ("acúmulo de produto bloqueou a passagem", "fila de embalagens causou obstrução", "produto sobreposto travou o fluxo", "processo acumulou material na entrada")),
    CausalFamily("WRONG_GUIDE_ADJUSTMENT", "OPERACAO", "LOW_PERFORMANCE", ("guia ajustada para largura incorreta", "abertura da guia ficou fora do formato", "regulagem da guia pressionou o produto", "guia operacional ficou distante da referência")),
)

# Shared causal vocabulary is intentional: it is the concept that must
# generalize across components. The detailed cause wording remains exclusive
# to one scenario and is therefore unseen in scenario holdout.
CAUSAL_CUES: dict[str, tuple[str, str]] = {
    "MECHANICAL_WEAR": ("desgaste mecânico", "degradação por uso"),
    "MECHANICAL_BREAKAGE": ("quebra mecânica", "fratura da peça"),
    "RUPTURE": ("rompimento físico", "ruptura do elemento"),
    "LEAKAGE": ("vazamento por defeito", "perda de estanqueidade"),
    "ELECTRICAL_FAILURE": ("falha elétrica", "defeito no circuito"),
    "SIGNAL_FAILURE": ("falha física no sinal", "defeito no sinal"),
    "BEARING_FAILURE": ("rolamento danificado", "falha no mancal"),
    "DRIVE_FAILURE": ("defeito no acionamento", "falha da transmissão"),
    "PNEUMATIC_FAILURE": ("falha pneumática", "defeito pneumático"),
    "SEAL_FAILURE": ("vedação danificada", "falha de vedação"),
    "MECHANICAL_CLEARANCE": ("folga mecânica", "jogo mecânico excessivo"),
    "HARDWARE_FAILURE": ("defeito eletrônico", "falha de hardware"),
    "OVERHEATING": ("aquecimento causado por defeito", "falha térmica física"),
    "STRUCTURAL_DAMAGE": ("dano estrutural", "estrutura avariada"),
    "BLOCKAGE_BY_FAILURE": ("obstrução por peça danificada", "bloqueio causado por avaria"),
    "COMPONENT_DEGRADATION": ("degradação do componente", "deterioração física"),
    "BAD_SETUP": ("setup incorreto", "preparação inadequada"),
    "BAD_ADJUSTMENT": ("regulagem incorreta", "ajuste incorreto"),
    "POSITIONING_ERROR": ("posicionamento incorreto", "produto mal posicionado"),
    "WRONG_RECIPE": ("receita incorreta", "programa de produto errado"),
    "WRONG_PARAMETER": ("parâmetro incorreto", "configuração de valor errada"),
    "WRONG_REFERENCE": ("referência incorreta", "ponto de referência errado"),
    "EXCESS_FEED": ("alimentação excessiva", "excesso de produto"),
    "WRONG_SPEED_SETTING": ("velocidade mal configurada", "ajuste de velocidade incorreto"),
    "INADEQUATE_FLOW": ("fluxo de processo inadequado", "vazão mal ajustada"),
    "WRONG_PROCEDURE": ("procedimento incorreto", "rotina produtiva inadequada"),
    "FORMAT_CHANGE_ERROR": ("troca de formato mal realizada", "erro na conversão de formato"),
    "WRONG_SEQUENCE": ("sequência incorreta", "ordem de comandos errada"),
    "STARTUP_PROCEDURE_ERROR": ("procedimento de partida incorreto", "partida fora da sequência"),
    "HANDLING_ERROR": ("manuseio inadequado", "intervenção manual incorreta"),
    "PRODUCT_ACCUMULATION": ("acúmulo de produto", "excesso acumulado no processo"),
    "WRONG_GUIDE_ADJUSTMENT": ("regulagem incorreta da guia", "guia mal ajustada"),
}

COMPONENTS = (
    "SENSOR", "GUIA", "ESTRELA", "BOCAL", "VALVULA", "GARRA", "SERVO", "TRANSPORTADOR",
    "REJEITOR", "DOSADOR", "CORREIA", "ACOPLAMENTO", "MOTOR", "CILINDRO", "BOMBA", "INVERSOR",
    "ALIMENTADOR", "ROLAMENTO", "MANGUEIRA", "VEDACAO",
)
EQUIPMENT = ("ENVASADORA", "ROTULADORA", "TRANSPORTADOR", "PALETIZADORA", "LAVADORA", "EMPACOTADORA")
STOP_TYPES = ("Anomalia", "Processo", "Parada não programada", "Ajuste")
LINES = ("L01", "L02", "L03", "L04", "L05", "L06")
PREFIXES = ("", "durante o ciclo, ", "foi identificado que ", "após inspeção, ", "parada porque ")
SUFFIXES = ("", " durante a produção", " e houve interrupção", " no ciclo atual", " causando parada do equipamento")
SYMPTOMS = {
    "MISALIGNMENT": "{component} desalinhado",
    "OUT_OF_POSITION": "{component} fora de posição",
    "NO_ACTUATION": "{component} não atuou",
    "LOW_FLOW": "{component} com fluxo insuficiente",
    "INTERMITTENT_STOP": "{component} parou de forma intermitente",
    "NO_SIGNAL": "{component} sem sinal",
    "OVERLOAD": "{component} em sobrecarga",
    "WRONG_SPEED": "{component} operando em velocidade incorreta",
    "SLOW_MOVEMENT": "{component} com movimento lento",
    "PRODUCT_LOSS": "{component} provocou perda de produto",
    "POSITION_DRIFT": "{component} perdeu a posição",
    "COMMAND_FAILURE": "{component} não respondeu ao comando",
    "THERMAL_ALARM": "{component} apresentou alarme térmico",
    "VIBRATION": "{component} apresentou vibração elevada",
    "BLOCKAGE": "{component} ficou bloqueado",
    "LOW_PERFORMANCE": "{component} apresentou baixo desempenho",
}
CONNECTORS = (" devido a ", " porque ocorreu ", " em razão de ", " após constatação de ")


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def component_label(component: str) -> str:
    return component.lower().replace("_", " ")


def add_noise(text: str, variant: int) -> str:
    if variant % 5 == 1:
        return text.upper()
    if variant % 5 == 2:
        return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    if variant % 5 == 3:
        return text.replace("apresentou", "apres.").replace("incorretamente", "incorreto")
    return text


def build_rows(rows_per_scenario: int) -> list[dict[str, str]]:
    rng = random.Random(RANDOM_SEED)
    rows: list[dict[str, str]] = []
    all_families = MAINTENANCE + OPERATION
    for family_index, family in enumerate(all_families):
        # Four components per family: two can train, one validate and one test.
        # The two origins reuse the same rotation, making every component's
        # marginal class distribution exactly balanced.
        offset = family_index % len(MAINTENANCE)
        family_components = tuple(COMPONENTS[(offset + step * 5) % len(COMPONENTS)] for step in range(4))
        for component_index, component in enumerate(family_components, start=1):
            scenario_id = f"{family.origin[0]}_{family.name}_{component_index:02d}"
            symptom = SYMPTOMS[family.hard_negative_type].format(component=component_label(component))
            for variant in range(rows_per_scenario):
                # A cause formulation belongs to exactly one scenario in the
                # family. Scenario holdout therefore also holds out the exact
                # causal wording, rather than testing a copied phrase on a new
                # component only.
                detailed_cause = family.causes[(component_index - 1) % len(family.causes)]
                causal_cue = CAUSAL_CUES[family.name][variant % 2]
                cause = f"{causal_cue}, confirmado por {detailed_cause}"
                observation = f"{PREFIXES[variant % len(PREFIXES)]}{symptom}{CONNECTORS[variant % len(CONNECTORS)]}{cause}{SUFFIXES[(variant * 3) % len(SUFFIXES)]}"
                observation = add_noise(re.sub(r"\s+", " ", observation).strip(), variant)
                equipment = EQUIPMENT[COMPONENTS.index(component) % len(EQUIPMENT)]
                stop_type = STOP_TYPES[(variant + component_index) % len(STOP_TYPES)]
                rows.append({
                    "scenario_id": scenario_id,
                    "causal_family": family.name,
                    "hard_negative_type": family.hard_negative_type,
                    "observation": observation,
                    "equipment": equipment,
                    "stop_type": stop_type,
                    "stop_key_1": f"GRUPO_{COMPONENTS.index(component) % 5 + 1}",
                    "stop_subkey": component,
                    "line": LINES[(variant + family_index) % len(LINES)],
                    "failed_component_code": component,
                    "failure_mode": f"Falha de {component_label(component)}",
                    "failure_origin": family.origin,
                })
    rng.shuffle(rows)
    for row_id, row in enumerate(rows, start=1):
        row["row_id"] = str(row_id)
    return rows


def validate(rows: list[dict[str, str]]) -> dict[str, object]:
    if not rows:
        raise RuntimeError("Dataset vazio.")
    counts = Counter(row["failure_origin"] for row in rows)
    if set(counts) != set(ORIGINS) or counts[ORIGINS[0]] != counts[ORIGINS[1]]:
        raise RuntimeError(f"Classes inválidas ou desbalanceadas: {counts}")
    scenario_labels: defaultdict[str, set[str]] = defaultdict(set)
    feature_labels: defaultdict[str, set[str]] = defaultdict(set)
    for row in rows:
        scenario_labels[row["scenario_id"]].add(row["failure_origin"])
        feature_key = " | ".join(normalize(row[column]) for column in FEATURE_COLUMNS)
        feature_labels[feature_key].add(row["failure_origin"])
        feature_text = " ".join(normalize(row[column]) for column in FEATURE_COLUMNS)
        if any(token in feature_text.split() for token in ORIGINS):
            raise RuntimeError(f"Target leakage literal na linha {row['row_id']}")
    if any(len(labels) != 1 for labels in scenario_labels.values()):
        raise RuntimeError("Um scenario_id possui mais de uma classe.")
    if any(len(labels) != 1 for labels in feature_labels.values()):
        raise RuntimeError("Features idênticas possuem classes conflitantes.")

    proxy_dominance: dict[str, float] = {}
    for column in ("equipment", "stop_type", "stop_key_1", "stop_subkey", "line", "failed_component_code", "failure_mode"):
        groups: defaultdict[str, Counter[str]] = defaultdict(Counter)
        for row in rows:
            groups[row[column]][row["failure_origin"]] += 1
        dominance = max(max(group.values()) / sum(group.values()) for group in groups.values())
        proxy_dominance[column] = round(dominance, 6)
        if dominance > 0.70:
            raise RuntimeError(f"Proxy artificial em {column}: dominância={dominance:.3f}")
    return {
        "rows": len(rows),
        "scenarios": len(scenario_labels),
        "causal_families": len({row["causal_family"] for row in rows}),
        "components": len({row["failed_component_code"] for row in rows}),
        "class_counts": dict(counts),
        "proxy_dominance": proxy_dominance,
        "direct_target_leakage": 0,
        "feature_label_conflicts": 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera dataset sintético causal de origem V2.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--rows-per-scenario", type=int, default=ROWS_PER_SCENARIO)
    args = parser.parse_args()
    if args.rows_per_scenario < 8:
        raise ValueError("--rows-per-scenario deve ser >= 8")
    rows = build_rows(args.rows_per_scenario)
    summary = validate(rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = (
        "row_id", "scenario_id", "causal_family", "hard_negative_type", "observation", "equipment",
        "stop_type", "stop_key_1", "stop_subkey", "line", "failed_component_code", "failure_mode",
        "failure_origin",
    )
    with args.output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print("EASY MAINTENANCE - DATASET DE ORIGEM V2")
    for key, value in summary.items():
        print(f"{key}: {value}")
    print(f"Arquivo: {args.output.resolve()}")


if __name__ == "__main__":
    main()
