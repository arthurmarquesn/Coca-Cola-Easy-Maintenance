# Ursus reranker v1.6 — experimento controlado

Resultado do protocolo: **PASS**  
Uso de TEST para seleção: **FALSE**  
Vencedor em VALIDATION: **SUPPORT_CAPPED**

## VALIDATION

| Modelo | Top-1 | Top-3 | Top-5 | MRR | Expulsões |
|---|---:|---:|---:|---:|---:|
| Baseline v1.5 | 74.1606% | 89.7810% | 91.8248% | 0.819016 | 2 |
| Vencedor | 74.0146% | 90.0730% | 91.8248% | 0.818841 | 2 |

## TEST final — uma única avaliação após lock

Top-1: **74.4986%**  
Top-3: **90.4011%**  
Top-5: **92.5501%**  
MRR: **0.826208**  
Expulsões: **8**  
Meta Top-3 > 90%: **PASS**

O artefato permanece experimental e não foi ativado em produção.
