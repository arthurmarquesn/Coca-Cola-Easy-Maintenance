# Guia inicial de rotulagem — preparação Ursus v1.6

> Este guia é inferido exclusivamente dos apontamentos existentes. Não substitui a definição de um especialista.

## Fórmula de prioridade de classes

`priority_score` usa frequência observada (15%), baixo suporte (15%), erro congelado v1.5 (15%), confusão persistente (10%), proximidade semântica (10%), impacto por F1 da classe (10%), família prioritária (10%), margem baixa (5%), possível discrepância (5%) e oportunidade de automação derivada de frequência × margem (5%).

Não existe criticidade operacional no dataset; nenhum peso de criticidade foi inventado.

## Fórmula de active learning

`active_learning_score = 30% uncertainty + 20% rarity + 20% persistent_confusion + 15% representativeness + 10% disagreement + 5% diversity_adjustment`.

## Anomalia de suporte 6–10

```json
{
  "support_4_5": {
    "classes": 23,
    "mean_test_accuracy": 0.65217391,
    "mean_intra_similarity": 0.76150765,
    "mean_textual_diversity_proxy": 0.23849235,
    "mean_nearest_other_similarity": 0.35234925,
    "mean_separation_margin": 0.40915839,
    "generic_label_share": 0.30434783,
    "families": 11,
    "other_unknown_share": 0.52173913,
    "persistent_confusion_classes": 5
  },
  "support_6_10": {
    "classes": 49,
    "mean_test_accuracy": 0.57993197,
    "mean_intra_similarity": 0.62609441,
    "mean_textual_diversity_proxy": 0.37390559,
    "mean_nearest_other_similarity": 0.38365498,
    "mean_separation_margin": 0.24243943,
    "generic_label_share": 0.26530612,
    "families": 29,
    "other_unknown_share": 0.26530612,
    "persistent_confusion_classes": 29
  }
}
```

## Pares prioritários

### ENROSCO DE ROTULOS vs FALHA DE ROTULAGEM

- Definição inferida de `ENROSCO DE ROTULOS`: observações frequentemente mencionam ENROSCO, ROTULO, ROTULOS, FALHA, AGREGADO.
- Definição inferida de `FALHA DE ROTULAGEM`: observações frequentemente mencionam FALHA, ROTULO, GARRAFA, ROTULADORA, LINATRONIC.
- Exemplos positivos `ENROSCO DE ROTULOS`: ENROSCO DE ROTULO ( CASTELO DANIFICADO ) | ENROSCO DE ROTULO | ENROSCO DE ROTULOS DO AGREGADO 1, AS ESPONJAS ANTIGAS NÃO ESTAVA ABSORVENDO A AGUA, FOI NECESSARIO AUMENTAR UM VOLUME DA AGUA
- Exemplos positivos `FALHA DE ROTULAGEM`: AJUSTE NO SINCRONISMO DA ESTRELA DE TRANSFERENCIA ROTULADORA/ENCHEDORA NOTA N°30008248232 | FALHA NA TROCA DE ROTULOS PARA ESPONJA TROCA DE HASTE 30008367061 | FALHA AUTOMAÇÃO NO TRANSPORTE NA ENTRADA DA ROTULADORA
- Como diferenciar nos dados atuais: termos mais exclusivos de `ENROSCO DE ROTULOS`: ENROSCO, AGREGADO, AGUA, APLICACAO, ESPONJAS; de `FALHA DE ROTULAGEM`: GARRAFA, ROTULADORA, LINATRONIC, TROCA, SALA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE ACUMULO NO TRANSPORTE vs FALHA DE SINCRONISMO

- Definição inferida de `FALHA DE ACUMULO NO TRANSPORTE`: observações frequentemente mencionam TRANSPORTE, ACUMULO, GERANDO, ALINHADOR, LATAS.
- Definição inferida de `FALHA DE SINCRONISMO`: observações frequentemente mencionam SINCRONISMO, FORA, ENCHEDORA, FALHA, ORDEM.
- Exemplos positivos `FALHA DE ACUMULO NO TRANSPORTE`: TRANSPORTE DERRUBANDO GERANDO ACUMULO E FALHA NO ALINHADOR DA FILTEC | SENSORES DE ACUMULO DO TRANSPORTE FORA DE SINCRONISMO COM ENCHEDORA NÃO PARANDO NO MOMENTO CORRETO 30008299301 | QUEDA DE LATAS NO TRANSPORTE, GERANDO ACUMULO DE LATAS NO ALINHADOR DA FILTEC
- Exemplos positivos `FALHA DE SINCRONISMO`: ENCHEDORA FORA DE SINCRONISMO.ORDEM- 30008265280. | RINSER FORA DE SINCRONISMO. ORDEM- 30008272278 | TRAVAMENTO NA ENTRADA ENTRE O CARACOL E A ESTRELA DE ENTRADA ,TIRANDO FORA DE SINCRONISMO ,GUIAS DE ENTRADA SOLTO .ORDEM.30008274680
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE ACUMULO NO TRANSPORTE`: TRANSPORTE, ACUMULO, GERANDO, ALINHADOR, LATAS; de `FALHA DE SINCRONISMO`: SINCRONISMO, FORA, FALHA, ORDEM, ENTRADA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### ESCAPE DE ESTEIRA vs FALHA DE ESTEIRA

- Definição inferida de `ESCAPE DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, CURVA, ESCAPOU, PALETIZADORA, TRANSPORTE.
- Definição inferida de `FALHA DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, TROCA, PALETIZADORA, SAIDA, MESA.
- Exemplos positivos `ESCAPE DE ESTEIRA`: ESTEIRA DA CURVA DE ENTRADA DA PALETIZADORA ESCAPANDO | NYLON DA ESTEIRA DO TRANSPORTE DE SAIDA DA LAVADORA SAIU FORA DE POSIÇÃO OCASIONADO QUEDA DE GARRAFAS NA SAIDA | ESCAPOU A ESTEIRA NA CURVA DA PALETIZADORA
- Exemplos positivos `FALHA DE ESTEIRA`: TROCA DA ESTEIRA DE REJEITO (ESTEIRA NOVA NÃO PERMITIA SICRONISMO) | TROCA DA ESTEIRA DE REJEITO (ESTEIRA NOVA NÃO PERMITIA SICROMISMO) | ESTEIRA DERRUBANDO LATAS E PASSANDO SEM CODIFICAÇÃO 30008262675
- Como diferenciar nos dados atuais: termos mais exclusivos de `ESCAPE DE ESTEIRA`: CURVA, ESCAPOU, TRANSPORTE, ESCAPANDO; de `FALHA DE ESTEIRA`: TROCA, MESA, ARRASTE, LATAS.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE ALIMENTACAO DE TAMPAS vs FALHA DE VIBRADOR

- Definição inferida de `FALHA DE ALIMENTACAO DE TAMPAS`: observações frequentemente mencionam TAMPAS, TAMPA, GARRAFAS, FALHA, FALTA.
- Definição inferida de `FALHA DE VIBRADOR`: observações frequentemente mencionam VIBRADOR, TAMPAS, NECESSARIA, ADEQUACAO, LACRADOR.
- Exemplos positivos `FALHA DE ALIMENTACAO DE TAMPAS`: FALTA DE TAMPA NA TOLVA / VIBRADOR EM FALHA | FALTA DE TAMPA NA TOLVA/ VIBRADOR EM FALHA | SAINDO GARRAFAS SEM TAMPAS, QUEDA NA MESA DE ARRASTE DA EMPACOTADORA
- Exemplos positivos `FALHA DE VIBRADOR`: NECESSÁRIA ADEQUAÇÃO NO VIBRADOR DE TAMPAS DO LACRADOR. | FALHA NO ENVIO DE TAMPAS DO JET FLOW ( VIBRADOR) PARA A TOLVA | FALHA NO VIBRADOR
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE ALIMENTACAO DE TAMPAS`: TAMPA, GARRAFAS, FALTA, SAINDO, EMPACOTADORA; de `FALHA DE VIBRADOR`: VIBRADOR, NECESSARIA, ADEQUACAO, LACRADOR, FLOW.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE ELO DE ESTEIRA vs QUEBRA DE ESTEIRA

- Definição inferida de `FALHA DE ELO DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, VELOCIDADE, AJUSTE, ORDEM, SAIDA.
- Definição inferida de `QUEBRA DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, QUEBRA, ORDEM, SAIDA, TRANSPORTE.
- Exemplos positivos `FALHA DE ELO DE ESTEIRA`: AJUSTE EM ELO DA ESTEIRA QUE ESTAVA SE SOLTANDO / 13122841 | ALTERADO PARAMETRO DE VELOCIDADE DE ESTEIRA DEVIDO PACOTES SAINDO ABERTO | TRANSPORTE DE CAIXAS ELO DANIFICADO, FOI REALIZADO A TROCA ORDEM: 30008465403
- Exemplos positivos `QUEBRA DE ESTEIRA`: QUEBROU ESTEIRA NA ENTRADA DA LAVADORA DE CAIXAS, GERANDO ENROSCO DE CAIXAS ORDEM: 30008223803 | QUEBRA DA ESTEIRA | QUEBRA DA ESTEIRA DA CURVA ENTRADA PALETIZADORA ORDEM Nº 30008241836 NOTA 13129837
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE ELO DE ESTEIRA`: VELOCIDADE, AJUSTE, TAPETE, REALIZADO; de `QUEBRA DE ESTEIRA`: QUEBRA, TRANSPORTE, QUEBRADA, ENTRADA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE INSPECAO vs FALHA DE SENSOR

- Definição inferida de `FALHA DE INSPECAO`: observações frequentemente mencionam FALHA, GARRAFAS, INSPETOR, INSPECAO, QUEDA.
- Definição inferida de `FALHA DE SENSOR`: observações frequentemente mencionam SENSOR, FALHA, ORDEM, GARRAFAS, PORTA.
- Exemplos positivos `FALHA DE INSPECAO`: FALHA NA LEITURA DO DENSIMETRO | CRASH NA SAIDA DO ASEBI | RECUPERAÇÃO DE ENVASE DEVIDO PARADA DO ENOS FALHA CRITICA RUIDO AUTO CANAL 1 ( 30008257602 )
- Exemplos positivos `FALHA DE SENSOR`: TRAVANDO AS VÁLVULA 41E 42 ,PROBLEMA DO SENSOR DO AR PREVIO. | ATUADOR DO SENSOR TRAVADO ORDEM: 30008223804 | FALHA NO SENSOR DA ASTE DE PEGADA DE CAMADAS ( 30008224330 )
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE INSPECAO`: INSPETOR, INSPECAO, QUEDA, FILTEC, LEITURA; de `FALHA DE SENSOR`: SENSOR, ORDEM, PORTA, FORA, ENTRADA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA ELETRONICA DA VALVULA vs FALHA DE VALVULA

- Definição inferida de `FALHA ELETRONICA DA VALVULA`: observações frequentemente mencionam TROCA, ELETRONICA, VALVULA, PARTE, PRTE.
- Definição inferida de `FALHA DE VALVULA`: observações frequentemente mencionam VALVULA, FALHA, TROCA, ORDEM, BORBOLETA.
- Exemplos positivos `FALHA ELETRONICA DA VALVULA`: TROCA DA ELETRONICA DA VALVULA 91 30008305817 | TROCA DA PARTE ELETRÔNICA DA VÁLVULA N°9 | TROCA DA PRTE ELETRONICA DA VALVULA NUMURO 9 (30008374835)
- Exemplos positivos `FALHA DE VALVULA`: GFS AMASSADAS / QUEDA NA SAIDA DA ENCHEDORA / VALVULAS Nº 09 E 25 | TROCA DA VALVULA NUMERO 39 (30008265435 | QUEBRA DA VÁLVULA DE PRESSÃO DO SEGURADOR DE CAIXAS. (30008275548)
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA ELETRONICA DA VALVULA`: ELETRONICA, PARTE, PRTE, NUMURO; de `FALHA DE VALVULA`: FALHA, ORDEM, BORBOLETA, ENCHEDORA, VALVULAS.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### TRAVAMENTO DE ROBO vs FALHA DE ROBO

- Definição inferida de `TRAVAMENTO DE ROBO`: observações frequentemente mencionam ROBO, TRAVANDO, PACOTES, TREPIDACAO, CAPACIDADE.
- Definição inferida de `FALHA DE ROBO`: observações frequentemente mencionam ROBO, FALHA, CAMADA, CAIXAS, PALETE.
- Exemplos positivos `TRAVAMENTO DE ROBO`: ROBO TRAVANDO E DERUBANDO CAMADA DE PACOTES | ROBO COM TREPIDAÇÃO/TRAVANDO, MODIFICADO VENSOSAS AFIM DE SEGURAR MELHOR PACOTES DURANTE A TRIPIDAÇAO | ROBO COM TREPIDAÇÃO/TRAVANDO CAPACIDADE DE PRODUÇÃO REDUZIDA DO ROBO.DEVIDO A QUEDA DE PACOTES
- Exemplos positivos `FALHA DE ROBO`: ROBO COM TREPIDAÇÃO/ QUEDA DE PACOTE SOBRE A MESA DE CARGA NOTA ( 30008356563) | ROBO COM TREPIDAÇÃO/ QUEDA DE PACOTE SOBRE A MESA DE CARGA | VELOCIDADE REDUZIDA POR TREPIDAÇÃO DO ROBO, ORDEM : 30008369448
- Como diferenciar nos dados atuais: termos mais exclusivos de `TRAVAMENTO DE ROBO`: TRAVANDO, PACOTES, CAPACIDADE, PRODUCAO, REDUZIDA; de `FALHA DE ROBO`: FALHA, CAMADA, CAIXAS, PALETE, PACOTE.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DO COLOCADOR DE CHAPATEX vs FALHA DO COLOCADOR DE CARTAO

- Definição inferida de `FALHA DO COLOCADOR DE CHAPATEX`: Definição requer especialista.
- Definição inferida de `FALHA DO COLOCADOR DE CARTAO`: Definição requer especialista.
- Exemplos positivos `FALHA DO COLOCADOR DE CHAPATEX`: COLOCADOR DE CHAPATEX PAROU DE ATUAR | FALHA NA COLOCAÇÃO DO CHAPATEX | FALHA ELETRICA NO COLOCADOR DE CHAPATEX
- Exemplos positivos `FALHA DO COLOCADOR DE CARTAO`: FALHA NO COLOCADOR DE CARTÃO, ORDEM : 30008724728 | ROBO SOLTOU CARTÃO NO MEIO DO TRAJETO, CAIU NA FRENTE DA BARREIRA, MAQUINA SE PERDEU NOS CICLOS AUTOMATICOS
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DO COLOCADOR DE CHAPATEX`: CHAPATEX, PAROU, ATUAR, COLOCACAO, ELETRICA; de `FALHA DO COLOCADOR DE CARTAO`: CARTAO, ORDEM, ROBO, SOLTOU, MEIO.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE ENVOLVIMENTO vs FALHA DE REGUA DE ENVOLVIMENTO

- Definição inferida de `FALHA DE ENVOLVIMENTO`: observações frequentemente mencionam ENVOLVIMENTO, FALHA, PACOTES, FILME, PACOTE.
- Definição inferida de `FALHA DE REGUA DE ENVOLVIMENTO`: observações frequentemente mencionam ENVOLVIMENTO, REGUA, QUEDA, FALHA, ORDEM.
- Exemplos positivos `FALHA DE ENVOLVIMENTO`: FALHA NO EIXO DE ENVOLVIMENTO DO FILME | FALTANDO UMA FAIXA NA RAMPA DE SUBIDA DO FILME PARA ENVOLVIMENTO | PACOTE ABERTO POR CONTA DA CINTA DE ENVOLVIMENTO
- Exemplos positivos `FALHA DE REGUA DE ENVOLVIMENTO`: FALHA NO SISTEMA DE ENVOLVIMENTO QUEDA DA REGUA DE ENVOLVIMENTO - ORDEM - 30008489606 | FALHA NA RÉGUA DE ENVOLVIMENTO NOTA : 30008539935 | EMPACOTADORA QUEDA DA REGUA DE ENVOLVIMENTO 2
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE ENVOLVIMENTO`: PACOTES, PACOTE, ABERTO, ABRINDO, SAINDO; de `FALHA DE REGUA DE ENVOLVIMENTO`: REGUA, QUEDA, ORDEM, SISTEMA, NOTA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### DEFORMACAO DESALINHAMENTO DE GUIA vs DESALINHAMENTO DE GUIA

- Definição inferida de `DEFORMACAO DESALINHAMENTO DE GUIA`: observações frequentemente mencionam GUIA, TORTO, GUIAS, TORTA, CAUSANDO.
- Definição inferida de `DESALINHAMENTO DE GUIA`: observações frequentemente mencionam GUIA, CHAPA, GARRAFAS, FORA, POSICAO.
- Exemplos positivos `DEFORMACAO DESALINHAMENTO DE GUIA`: TWISTER COM GUIA TORTO CAUSANDO ENROSCO DE LATAS EM PARTIDAS DA ENCHEDORA | GUIA DE SAIDA DO FORNO DA EMPACOTADORA COM CALÇO PARA CORRIGIR A DEFORMAÇÃO DO GUIA/MA FORMAÇÃO NO PACOTE | GUIA SUPERIOR E ESTRELA DO CAPSULADOR DESAJUSTADA, OCASIONANDO AS TAMPAS AMASSADAS ORDEM: 30008374149
- Exemplos positivos `DESALINHAMENTO DE GUIA`: ENTORTOU A CHAPA DO GUIA DE TRANSFERENCIA DE GARRAFAS ( 30008219114 ) | GUIA DO PESCOÇO DA GARRAFAS FORA DE POSIÇÃO 30008241870 | COLISÃO DA GARRAFA NO CABEÇOTE COM O CENTRALIZADOR PROVOCOU O ENTORTAMENTO DA CHAPA DO CABEÇOTE.
- Como diferenciar nos dados atuais: termos mais exclusivos de `DEFORMACAO DESALINHAMENTO DE GUIA`: TORTO, GUIAS, TORTA, CAUSANDO, LATAS; de `DESALINHAMENTO DE GUIA`: CHAPA, GARRAFAS, FORA, POSICAO, GARRAFA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE MISTURA vs FALHA DE MIXER

- Definição inferida de `FALHA DE MISTURA`: Definição requer especialista.
- Definição inferida de `FALHA DE MIXER`: Definição requer especialista.
- Exemplos positivos `FALHA DE MISTURA`: FALHA NO MIXER | FALHAVÃLVULA DE TUBULAÇÃO NA ENTRADA DE BEBIDA NO MIXER, OCASIONANDO VAZAMENTO DE BEBIDAS ORDEM: 30008450138 | ATRASO NO CIP DURANTE 5 ETAPAS CCKSZ - FALHA NO MIXER
- Exemplos positivos `FALHA DE MIXER`: FALHA NO PARAMIX | FALHA NO MIXER ORDEM 30008716794
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE MISTURA`: FALHAVALVULA, TUBULACAO, ENTRADA, BEBIDA, OCASIONANDO; de `FALHA DE MIXER`: PARAMIX, ORDEM.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### QUEBRA DE ENGRENAGEM vs FALHA DE ENGRENAGEM

- Definição inferida de `QUEBRA DE ENGRENAGEM`: Definição requer especialista.
- Definição inferida de `FALHA DE ENGRENAGEM`: Definição requer especialista.
- Exemplos positivos `QUEBRA DE ENGRENAGEM`: QUEBRA DA ENGRENAGEM DO TRANSPORTE DA HEUFT | QUEBRA DA ENGRENAGEM PLANETÁRIA ORDEM (30008775073)
- Exemplos positivos `FALHA DE ENGRENAGEM`: ENGRENAGEM DANIFICADA, QUEDA DE ESTEIRA | TROCA DA ENGRENAGEM DA ESTEIRA | FIXAÇÃO DA EMGRENAGEM SOLTA 30008609203
- Como diferenciar nos dados atuais: termos mais exclusivos de `QUEBRA DE ENGRENAGEM`: QUEBRA, TRANSPORTE, HEUFT, PLANETARIA, ORDEM; de `FALHA DE ENGRENAGEM`: QUEDA, ESTEIRA, GERANDO, FALHA, DANIFICADA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE MANGUEIRA vs FALHA DE CONEXAO DE MANGUEIRA

- Definição inferida de `FALHA DE MANGUEIRA`: observações frequentemente mencionam MANGUEIRA, TROCA, SISTEMA, PNEUMATICO, ATUADOR.
- Definição inferida de `FALHA DE CONEXAO DE MANGUEIRA`: observações frequentemente mencionam MANGUEIRA, CONEXAO, ESCAPOU, TROCA, ALIMENTACAO.
- Exemplos positivos `FALHA DE MANGUEIRA`: TROCA DA MANGUEIRA DO SISTEMA PNEUMATICO DO ATUADOR CANAL C DO DEVAISER (30008240197) | TROCA DE MANGUEIRA | ATRASO FALHA DURANTE CIP MANGUEIRA ENTRADA DO POLIDOR DESCONECTADA
- Exemplos positivos `FALHA DE CONEXAO DE MANGUEIRA`: MANGUEIRA DE CONTRA PRESSÃO ESCAPOU | MANGUEIRA E CONEXÃO DANIFICADA NA ESTAÇÃO DE EXPANSÃO DE PELÍCULA - 30008414432 | MANGUEIRA DE AR DO CABEÇOTE ESCAPOU
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE MANGUEIRA`: SISTEMA, PNEUMATICO, ATUADOR, CANAL, DEVAISER; de `FALHA DE CONEXAO DE MANGUEIRA`: CONEXAO, ESCAPOU, ALIMENTACAO, PNEUMATICA, CONTRA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### DESARME DE ESTEIRA vs QUEBRA DE ESTEIRA

- Definição inferida de `DESARME DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, MESA, PEGA, GARRAFAS, DESARMOU.
- Definição inferida de `QUEBRA DE ESTEIRA`: observações frequentemente mencionam ESTEIRA, QUEBRA, ORDEM, SAIDA, TRANSPORTE.
- Exemplos positivos `DESARME DE ESTEIRA`: DESARME DA ESTEIRA DE SAIDA DA ENCAIXOTADORA. | ESTEIRA DA MESA QUE PEGA GARRAFAS DESARMOU.ORDEM.. | ESTEIRA DA MESA QUE PEGA GARRAFAS DESARMOU.ORDEM..30008445667
- Exemplos positivos `QUEBRA DE ESTEIRA`: QUEBROU ESTEIRA NA ENTRADA DA LAVADORA DE CAIXAS, GERANDO ENROSCO DE CAIXAS ORDEM: 30008223803 | QUEBRA DA ESTEIRA | QUEBRA DA ESTEIRA DA CURVA ENTRADA PALETIZADORA ORDEM Nº 30008241836 NOTA 13129837
- Como diferenciar nos dados atuais: termos mais exclusivos de `DESARME DE ESTEIRA`: MESA, PEGA, GARRAFAS, DESARMOU, DESARME; de `QUEBRA DE ESTEIRA`: QUEBRA, TRANSPORTE, QUEBRADA, ENTRADA, PACOTES.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### TRAVAMENTO DE PERSIANA vs FALHA DE PERSIANA

- Definição inferida de `TRAVAMENTO DE PERSIANA`: Definição requer especialista.
- Definição inferida de `FALHA DE PERSIANA`: Definição requer especialista.
- Exemplos positivos `TRAVAMENTO DE PERSIANA`: TRAVAMENTO DA PERSIANA | PERSIANA DA GAIOLA TRAVADA. | PERSIANA TRAVADA - ORDEM: 30008498639
- Exemplos positivos `FALHA DE PERSIANA`: ENROSCO DA PERSIANA
- Como diferenciar nos dados atuais: termos mais exclusivos de `TRAVAMENTO DE PERSIANA`: TRAVADA, GAIOLA, TRAVAMENTO, ORDEM; de `FALHA DE PERSIANA`: ENROSCO.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### SOBRECORRENTE vs QUEBRA DE CORRENTE

- Definição inferida de `SOBRECORRENTE`: observações frequentemente mencionam TRANSPORTE, MOTOR, SOBRECORRENTE, FALHA, CAIXAS.
- Definição inferida de `QUEBRA DE CORRENTE`: observações frequentemente mencionam CORRENTE, PALETE, QUEBRA, MAGAZINE, QUEBROU.
- Exemplos positivos `SOBRECORRENTE`: FALHA MOTOR 311 TRANSPORTE DE CAIXAS VAZIAS DESARMANDO POR SOBRECORRENTE | FALHA MOTOR 311 TRANSPORTE DE CAIXAS VAZIAS DESARMANDO POR SOBRECORRENTE ORDEM: 30008239229 | SOBRE CORRENTE NO TRANSPORTE DE PALETE - OREDEM: 30008258302
- Exemplos positivos `QUEBRA DE CORRENTE`: QUEBRA DO ELO DA CORRENTE DO MAGAZINE DE PALETE . | TROCA DA EMENDA DA CORRENTE DANIFICADA 30008425473 | QUEBROU A CORRENTE DO ROLETE DE SAIDA DE PALETES ORDEM: 30008434816
- Como diferenciar nos dados atuais: termos mais exclusivos de `SOBRECORRENTE`: TRANSPORTE, SOBRECORRENTE, FALHA, CAIXAS, VAZIAS; de `QUEBRA DE CORRENTE`: CORRENTE, PALETE, QUEBRA, MAGAZINE, QUEBROU.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### TRAVAMENTO DE ATUADOR vs QUEBRA DE ATUADOR

- Definição inferida de `TRAVAMENTO DE ATUADOR`: observações frequentemente mencionam PISTAO, TRAVAMENTO, TAMPA, ENROSCO, OCASIONANDO.
- Definição inferida de `QUEBRA DE ATUADOR`: observações frequentemente mencionam PISTAO, QUEBRADO, HASTE, CILINDRO, BRACO.
- Exemplos positivos `TRAVAMENTO DE ATUADOR`: TRAVAMENTO DE PISTÃO, GERANDO O ENROSCO DE TAMPA | ATUADOR PNEUMÁTICO TARVADO | TRAVAMENTO PISTÃO DO CAPSULADOR, OCASIONANDO ENROSCO DE TAMPA ORDEM: 30007977072
- Exemplos positivos `QUEBRA DE ATUADOR`: PISTÃO DO APALPADOR QUEBRADO - 30008625922 | HASTE DO CILINDRO DO BRAÇO SEPARADOR DE CAIXAS ESCAPOU DA ROSCA DE FIXAÇÃO ORDEM: 30008629094 | PISTÃO EMPURRADOR DE TAMPA QUEBRADO NA SOLDA NOTA:30008758623
- Como diferenciar nos dados atuais: termos mais exclusivos de `TRAVAMENTO DE ATUADOR`: TRAVAMENTO, TAMPA, ENROSCO, OCASIONANDO, ORDEM; de `QUEBRA DE ATUADOR`: QUEBRADO, HASTE, CILINDRO, BRACO, QUEBRA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE MANGUEIRA PNEUMATICA vs FALHA DE CONEXAO DE MANGUEIRA

- Definição inferida de `FALHA DE MANGUEIRA PNEUMATICA`: observações frequentemente mencionam MANGUEIRA, TROCA, FALHA, CILINDRO, CABECOTE.
- Definição inferida de `FALHA DE CONEXAO DE MANGUEIRA`: observações frequentemente mencionam MANGUEIRA, CONEXAO, ESCAPOU, TROCA, ALIMENTACAO.
- Exemplos positivos `FALHA DE MANGUEIRA PNEUMATICA`: FALHA MANGUEIRA DO CILINDRO CABEÇOTE | PALETIZADORA TROCA DE MANGUEIRA DE AR DA GAIOLA | TROCA DE MANGUEIRA DE AR
- Exemplos positivos `FALHA DE CONEXAO DE MANGUEIRA`: MANGUEIRA DE CONTRA PRESSÃO ESCAPOU | MANGUEIRA E CONEXÃO DANIFICADA NA ESTAÇÃO DE EXPANSÃO DE PELÍCULA - 30008414432 | MANGUEIRA DE AR DO CABEÇOTE ESCAPOU
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE MANGUEIRA PNEUMATICA`: FALHA, CILINDRO, CABECOTE, PALETIZADORA, GAIOLA; de `FALHA DE CONEXAO DE MANGUEIRA`: CONEXAO, ESCAPOU, ALIMENTACAO, PNEUMATICA, CONTRA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA NO VIRADOR DE CAIXAS vs ENROSCO DE CAIXAS

- Definição inferida de `FALHA NO VIRADOR DE CAIXAS`: Definição requer especialista.
- Definição inferida de `ENROSCO DE CAIXAS`: Definição requer especialista.
- Exemplos positivos `FALHA NO VIRADOR DE CAIXAS`: FALHA BLOQUEIO NO VIRADOR DE CAIXAS ORDEM:30008618633 | VIRADOR DE CAIXA COM FALHA
- Exemplos positivos `ENROSCO DE CAIXAS`: PARAFUSO DO ALINHADOR DE CAIXA ,CAIU ,ENROSCANDO CAIXAS. | PARAFUSO DA GUIA TRASEIRA DA DESENCAIXATADORA SOLTO, OCASIONANDO ENROSCO DE CAIXAS NA GRELHA | TRAVAMENTO DE CAIXAS NO LAVADOR DE CAIXAS
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA NO VIRADOR DE CAIXAS`: FALHA, BLOQUEIO, ORDEM; de `ENROSCO DE CAIXAS`: CONGESTIONAMENTO, ENROSCO, PARAFUSO, PERDA, CONTAGEM.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### ENROSCO DE GARRAFAS vs TRAVAMENTO DE GARRAFAS NA SAIDA DA LAVADORA

- Definição inferida de `ENROSCO DE GARRAFAS`: observações frequentemente mencionam SAIDA, GARRAFAS, TRAVAMENTO, LAVADORA, ENCHEDORA.
- Definição inferida de `TRAVAMENTO DE GARRAFAS NA SAIDA DA LAVADORA`: observações frequentemente mencionam SAIDA, LAVADORA, TRAVAMENTO, TRVAMENTO, GARRAFA.
- Exemplos positivos `ENROSCO DE GARRAFAS`: VELOCIDADE REDUZIDA , RODANDO A 33K, DEVIDO CRASH NA ENCHEDORA | CRASH NA SAIDA DA ENCHEDORA , ASSIM QUE LIGASSE A MAQUINA ELE JA DAVA O CRASH | VELOCIDADE ABAIXO DA NOMINAL DEVIDO CRASH NA ENCHEDORA
- Exemplos positivos `TRAVAMENTO DE GARRAFAS NA SAIDA DA LAVADORA`: TRVAMENTO NA SAIDA DA LAVADORA | TRAVAMENTO NA SAIDA DA LAVADORA | TRAVAMENTO DE GARRAFA NA SAIDA DA LAVADORA
- Como diferenciar nos dados atuais: termos mais exclusivos de `ENROSCO DE GARRAFAS`: GARRAFAS, ENCHEDORA, ENROSCO, CRASH, ENTRADA; de `TRAVAMENTO DE GARRAFAS NA SAIDA DA LAVADORA`: TRVAMENTO, GARRAFA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE COMUNICACAO vs QUEIMA DA PLACA DEVICENET

- Definição inferida de `FALHA DE COMUNICACAO`: Definição requer especialista.
- Definição inferida de `QUEIMA DA PLACA DEVICENET`: Definição requer especialista.
- Exemplos positivos `FALHA DE COMUNICACAO`: FALHA DE COMUNICAÇÃO DE REDE (30008221834) | FALHA DE COMUNICAÇÃO INVERSORES DA PORTAS DE SEGURANÇA (30008240250) | IHM COM FALHA DE COMUNICAÇÃO 30008241782
- Exemplos positivos `QUEIMA DA PLACA DEVICENET`: QUEIMA DA PLACA DEVICENET 30008857644
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE COMUNICACAO`: FALHA, COMUNICACAO, REDE, ENCHEDORA, RESET; de `QUEIMA DA PLACA DEVICENET`: QUEIMA, PLACA, DEVICENET.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### DESALINHAMENTO DE EIXO vs QUEBRA DE EIXO

- Definição inferida de `DESALINHAMENTO DE EIXO`: observações frequentemente mencionam EIXO, TORTO, FIME, ESTOURANDO, DEVIDO.
- Definição inferida de `QUEBRA DE EIXO`: observações frequentemente mencionam EIXO, QUEBRA, PINCA, BANDEIROLA, LAVADORA.
- Exemplos positivos `DESALINHAMENTO DE EIXO`: FIME ESTOURANDO DEVIDO O EIXO TORTO | EIXO TORTO | EIXO TORTO DA BOBINA FOI PARADO PARA FAZER A TROCA
- Exemplos positivos `QUEBRA DE EIXO`: QUEBRA DO EIXO DA ENVOLVEDORA OREDEM: 30008406992 | O EIXO DA ESTEIRA DE ALIMENTACAO DA ENTRADA DA PALETIZADORA ESTAVA QUEBRADO | QUEBRA DO EIXO DO BRAÇO DA PRANCHA11324990
- Como diferenciar nos dados atuais: termos mais exclusivos de `DESALINHAMENTO DE EIXO`: TORTO, FIME, ESTOURANDO, DEVIDO, BOBINA; de `QUEBRA DE EIXO`: QUEBRA, PINCA, BANDEIROLA, LAVADORA, TRAVADA.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE JATOS DE ENXAGUE vs FALHA DE PRESSAO DOS JATOS

- Definição inferida de `FALHA DE JATOS DE ENXAGUE`: Definição requer especialista.
- Definição inferida de `FALHA DE PRESSAO DOS JATOS`: Definição requer especialista.
- Exemplos positivos `FALHA DE JATOS DE ENXAGUE`: JATOS FINAIS BAIXOS . ORDEM ;30008465755 | FALHA NO JATO FINAIS.
- Exemplos positivos `FALHA DE PRESSAO DOS JATOS`: PRESSAO BAIXA DOS JATOS FINAIS | PRESSAO DOS JATOS FINAIS BAIXO | PRESSÃO BAIXA JATO FINAIS.
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE JATOS DE ENXAGUE`: BAIXOS; de `FALHA DE PRESSAO DOS JATOS`: PRESSAO, BAIXA, BAIXO.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.

### FALHA DE LEITURA vs FALHA DE PARAMETRIZACAO DE RECEITA

- Definição inferida de `FALHA DE LEITURA`: Definição requer especialista.
- Definição inferida de `FALHA DE PARAMETRIZACAO DE RECEITA`: Definição requer especialista.
- Exemplos positivos `FALHA DE LEITURA`: FALSA REJEIÇÃO DE GARRAFAS, CAMERA 4 | ENCHEDORA NÃO RECINHECENDO O PULSO DA RECEITA DE 200ML, PULSO FICOU EM 2000ML
- Exemplos positivos `FALHA DE PARAMETRIZACAO DE RECEITA`: FALHA NO CALCULO DE CURVA DA RECEITA DE 200ML (ORDEM: 30008776224)
- Como diferenciar nos dados atuais: termos mais exclusivos de `FALHA DE LEITURA`: PULSO, FALSA, REJEICAO, GARRAFAS, CAMERA; de `FALHA DE PARAMETRIZACAO DE RECEITA`: FALHA, CALCULO, CURVA, 200ML, ORDEM.
- Casos ambíguos: revisar quando a observação descreve simultaneamente mecanismo, causa e efeito, ou quando não explicita qual deles é o modo principal.
