# Ursus — diagnóstico das falhas do reranker v1.5

Resultado: **PASS**  
Casos em rank 4–5: **18**  
Expulsões do Top-3: **11**

Nenhum modelo foi treinado ou alterado. As contribuições usam valores e coeficientes reais da LogisticRegression congelada.

## Classificação dos 18 recuperáveis

- LIKELY_TAXONOMY_PROBLEM: 5
- EASY_RERANK_RECOVERY: 8
- LIKELY_DATA_PROBLEM: 3
- LIKELY_REPRESENTATION_PROBLEM: 2
- POSSIBLE_RERANK_RECOVERY: 0

## Contrafactuais aritméticos

| Cenário | Hits adicionais | Top-3 |
|---|---:|---:|
| Restaurar expulsões | 11 | 91.5473% |
| Recuperar rank 4 | 13 | 91.8338% |
| Recuperar rank 4–5 | 18 | 92.5501% |
| Combinado sem sobreposição | 21 | 92.9799% |

## Evidência sobre hipóteses

- family_overvaluation: **SUPPORTED_IN_EXPULSION_SAMPLE**
- support_overvaluation: **SUPPORTED_IN_EXPULSION_SAMPLE**
- centroid_overvaluation: **INCONCLUSIVE**
- neighbor_overvaluation: **SUPPORTED_IN_EXPULSION_SAMPLE**
- rare_class_penalty: **SUPPORTED_IN_EXPULSION_SAMPLE**
- generic_class_promotion: **INCONCLUSIVE_SMALL_SAMPLE**
- other_unknown_promotion: **NOT_SUPPORTED**
- generic_specific_worsening: **NOT_OBSERVED**
- cause_effect_worsening: **NOT_OBSERVED**

## Recomendações

- A_feature_engineering: Add explicit relative candidate-vs-boundary features and separate label-text similarity from TRAIN prototype similarity; validate on VALIDATION only.
- B_weighting: Regularize or cap only feature groups with positive harmful deltas; do not globally remove family/support evidence from eleven cases alone.
- C_training_objective: Evaluate a listwise or pairwise objective that penalizes pushing the true class across the Top-3 boundary.
- D_negative_sampling: Emphasize hard negatives from ranks 2-5, same-family pairs, and reviewed generic-specific pairs.
- E_calibration: Calibrate the Top-3 boundary margin on VALIDATION; current row-wise reranker scores are ranking scores, not probabilities.
- F_taxonomy: Human-review strong taxonomy signals and pending pairs; do not merge concepts automatically.
- G_data_collection: Collect real examples for low-support affected classes, prioritizing support buckets with elevated expulsion lift.

As recomendações são hipóteses para futura validação em VALIDATION; não estimam ganho futuro e não foram implementadas.
