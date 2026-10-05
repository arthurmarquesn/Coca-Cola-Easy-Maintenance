from __future__ import annotations

import unittest
from ml.rules import classify_by_rule


class SemanticRulesTest(unittest.TestCase):
    def test_canonical_modes(self):
        cases = [
            ("FALHA NO CORTE DO FILME ORDEM 30008863270", "FALHA DE CORTE DE FILME", "SISTEMA_CORTE_FILME"),
            ("VELOCIDADE REDUZIDA, COLAPSO DE LATAS", "COLAPSO DE LATAS", "RECRAVADORA"),
            ("INVESTIGAÇÃO NA RECRAVADORA (AMASSANDO LATAS)", "AMASSAMENTO DE LATAS", "RECRAVADORA"),
            ("ESTEIRA PATINANDO ORDEM 30008863292", "PATINAMENTO DE ESTEIRA", "ESTEIRA"),
            ("ROLETE PATINANDO NA VIA DE ENTRADA", "PATINAMENTO DE ROLETE", "ROLETE"),
            ("QUEBRA DA ESTEIRA DA CURVA", "QUEBRA DE ESTEIRA", "ESTEIRA"),
            ("FALHA NA RECRAVAÇÃO", "FALHA DE RECRAVAÇÃO", "RECRAVADORA"),
            ("ESTEIRA DE SAIDA QUEBROU", "QUEBRA DE ESTEIRA", "ESTEIRA"),
            ("CORRENTE DA ESTEIRA QUEBRADA", "QUEBRA DE CORRENTE", "CORRENTE"),
            ("ROLETE DA ESTEIRA PATINANDO", "PATINAMENTO DE ROLETE", "ROLETE"),
            ("PATINAMENTO DO ROLETE DA ESTEIRA", "PATINAMENTO DE ROLETE", "ROLETE"),
            ("ESTEIRA PATINANDO NO ROLETE", "PATINAMENTO DE ROLETE", "ROLETE"),
        ]
        for observation, mode, component in cases:
            with self.subTest(observation=observation):
                result = classify_by_rule({"observation": observation, "equipment": "RECRAVADORA 708 G FRR LI04"})
                self.assertIsNotNone(result)
                self.assertEqual(result.failure_mode, mode)
                self.assertEqual(result.failed_component_code, component)

    def test_ambiguous_and_noncanonical_modes_go_to_ml(self):
        # V3 deliberately removed these deterministic mappings. Do not invent
        # a canonical label or override the explicit failure mechanism.
        cases = [
            "QUEBRA DA RESISTENCIA DO CORTE DO FILME",
            "LONA DA MESA DE ENVOLVIMENTO PATINANDO",
            "QUEBROU ROLAMENTOS DA ESTEIRA DE SAIDA DO FORNO",
            # The broken part comes after the verb, so the conveyor is not
            # the failure mechanism.
            "ESTEIRA DE SAIDA QUEBROU O ROLAMENTO",
            "ESTEIRA 3 QUEBROU PARAFUSO",
            "ROMPIMENTO DO CABO DO SENSOR DE RECUO",
            "INVERSOR PALETIZADORA QUEIMADO",
            "AJUSTE NA RECRAVAÇÃO (TECNICOS FERRUM)",
            "SETUP DO EQUIPAMENTO",
            "",
        ]
        for observation in cases:
            with self.subTest(observation=observation):
                self.assertIsNone(classify_by_rule({"observation": observation, "equipment": "RECRAVADORA 708 G FRR LI04"}))


if __name__ == "__main__":
    unittest.main()
