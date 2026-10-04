# Ursus — qualidade das sugestões Top-K

Resultado: **PASS**  
Versão da análise: `ursus-suggestion-quality-v1`  
Princípio: **observação → Top-3 sugestões → validação humana → classificação final**.

Esta análise não avalia prontidão para automação e não altera modelo, labels ou taxonomia.

## Métricas globais do TEST congelado

| Métrica | Valor |
|---|---:|
| Linhas | 698 |
| Top-1 | 75.5014% |
| Top-2 | 84.6705% |
| Top-3 | 89.9713% |
| Top-5 | 92.5501% |
| Top-10 | 94.4126% |
| MRR | 0.828390 |
| Mean expected rank | 12.3481 |
| Median expected rank | 1.0000 |

Top-3 misses: **70**.

## Distância para as metas Top-3

| Meta | Casos adicionais |
|---|---:|
| 90% | 1 |
| 92% | 15 |
| 95% | 36 |

## Coorte histórica de revisão v1.5

Linhas: **610**; Top-3: **88.5246%**; misses: **70**.  
Ela é reproduzida apenas para comparabilidade e não representa prontidão para automação.

## Distribuição de rank dos misses

| Rank | Casos |
|---|---:|
| 4 | 13 |
| 5 | 5 |
| 6-10 | 13 |
| 11-20 | 5 |
| >20 | 34 |

Recuperáveis do Top-5 para Top-3: **18**.

## Diagnóstico do reranker nos misses Top-3

Melhorou: **11**; piorou: **18**; neutro: **41**.
No TEST completo, trouxe **24** casos para o Top-3 e expulsou **11**, com saldo de **13** hits.

## Impacto taxonômico

Associação diagnóstica ampla: **70** misses.  
Sinais taxonômicos fortes: **38** misses.  
A associação ampla reutiliza diagnósticos construídos parcialmente sobre estes mesmos erros TEST; não é evidência causal independente.

## Gargalos relacionados — contagens não exclusivas

| Frente | Misses relacionados |
|---|---:|
| A_improve_taxonomy | 38 |
| B_review_labels | 1 |
| C_collect_data | 38 |
| D_improve_reranker | 11 |
| E_improve_text_representation | 59 |
| F_improve_family_component_mechanism | 57 |
| G_other | 6 |

## Próxima ação recomendada

1. Revisar primeiro os casos em rank 4–5, confrontando flat ranking e reranker.
2. Validar humanamente os misses ligados a pares taxonômicos pendentes e possíveis label noises.
3. Coletar exemplos reais para classes de baixo suporte antes de qualquer novo treinamento.
4. Somente depois repetir o treino em uma versão futura e medir o mesmo TEST sem usá-lo para seleção.

As contagens de gargalos se sobrepõem e não são estimativas de ganho futuro.
