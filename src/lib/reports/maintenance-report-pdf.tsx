import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  MaintenanceReportData,
  MaintenanceReportQuadrant,
} from "@/lib/reports/maintenance-report-data";

interface MaintenanceReportPdfProps {
  data:
    MaintenanceReportData;

  logoDataUri:
    string | null;
}

const COLORS = {
  red:
    "#E41E2B",

  dark:
    "#202327",

  text:
    "#3D4146",

  muted:
    "#858A90",

  light:
    "#F5F5F4",

  border:
    "#E3E5E7",

  gold:
    "#B58A14",

  white:
    "#FFFFFF",
};

const styles =
  StyleSheet.create({
    page: {
      fontFamily:
        "Helvetica",

      fontSize:
        9,

      color:
        COLORS.text,

      backgroundColor:
        COLORS.white,

      paddingTop:
        70,

      paddingBottom:
        48,

      paddingHorizontal:
        42,
    },

    cover: {
      fontFamily:
        "Helvetica",

      backgroundColor:
        COLORS.white,

      padding:
        52,

      position:
        "relative",
    },

    coverRedBar: {
      position:
        "absolute",

      left:
        0,

      top:
        0,

      bottom:
        0,

      width:
        13,

      backgroundColor:
        COLORS.red,
    },

    logo: {
      width:
        150,

      height:
        58,

      objectFit:
        "contain",
    },

    brandFallback: {
      fontSize:
        22,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.red,
    },

    coverLabel: {
      marginTop:
        115,

      fontSize:
        9,

      color:
        COLORS.red,

      fontFamily:
        "Helvetica-Bold",

      textTransform:
        "uppercase",

      letterSpacing:
        1.2,
    },

    coverTitle: {
      marginTop:
        12,

      maxWidth:
        440,

      fontSize:
        32,

      lineHeight:
        1.12,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    coverSubtitle: {
      marginTop:
        16,

      fontSize:
        13,

      color:
        COLORS.muted,
    },

    coverRule: {
      marginTop:
        32,

      width:
        72,

      height:
        4,

      borderRadius:
        2,

      backgroundColor:
        COLORS.red,
    },

    coverMeta: {
      marginTop:
        52,

      paddingTop:
        22,

      borderTopWidth:
        1,

      borderTopColor:
        COLORS.border,
    },

    coverMetaRow: {
      flexDirection:
        "row",

      marginBottom:
        10,
    },

    coverMetaLabel: {
      width:
        108,

      fontSize:
        8,

      color:
        COLORS.muted,

      textTransform:
        "uppercase",
    },

    coverMetaValue: {
      flex:
        1,

      fontSize:
        9,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    coverFooter: {
      position:
        "absolute",

      left:
        52,

      right:
        52,

      bottom:
        44,

      flexDirection:
        "row",

      justifyContent:
        "space-between",

      alignItems:
        "center",
    },

    coverFooterMain: {
      fontSize:
        9,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    coverFooterSecondary: {
      marginTop:
        3,

      fontSize:
        7,

      color:
        COLORS.muted,
    },

    internalHeader: {
      position:
        "absolute",

      top:
        24,

      left:
        42,

      right:
        42,

      height:
        28,

      paddingBottom:
        8,

      borderBottomWidth:
        1,

      borderBottomColor:
        COLORS.border,

      flexDirection:
        "row",

      justifyContent:
        "space-between",

      alignItems:
        "center",
    },

    headerLogo: {
      width:
        82,

      height:
        25,

      objectFit:
        "contain",
    },

    headerBrand: {
      fontSize:
        8,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.red,
    },

    headerText: {
      fontSize:
        7,

      color:
        COLORS.muted,
    },

    footer: {
      position:
        "absolute",

      left:
        42,

      right:
        42,

      bottom:
        20,

      paddingTop:
        7,

      borderTopWidth:
        1,

      borderTopColor:
        COLORS.border,

      flexDirection:
        "row",

      justifyContent:
        "space-between",
    },

    footerText: {
      fontSize:
        6.5,

      color:
        COLORS.muted,
    },

    sectionNumber: {
      fontSize:
        8,

      color:
        COLORS.red,

      fontFamily:
        "Helvetica-Bold",

      textTransform:
        "uppercase",

      letterSpacing:
        1,
    },

    sectionTitle: {
      marginTop:
        5,

      fontSize:
        23,

      color:
        COLORS.dark,

      fontFamily:
        "Helvetica-Bold",
    },

    sectionDescription: {
      marginTop:
        8,

      maxWidth:
        460,

      fontSize:
        9,

      lineHeight:
        1.5,

      color:
        COLORS.muted,
    },

    divider: {
      marginTop:
        18,

      marginBottom:
        18,

      height:
        1,

      backgroundColor:
        COLORS.border,
    },

    kpiGrid: {
      flexDirection:
        "row",

      flexWrap:
        "wrap",

      gap:
        8,

      marginTop:
        20,
    },

    kpiCard: {
      width:
        "31.8%",

      minHeight:
        76,

      padding:
        12,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      borderRadius:
        8,

      backgroundColor:
        "#FCFCFB",
    },

    kpiLabel: {
      fontSize:
        7,

      color:
        COLORS.muted,

      textTransform:
        "uppercase",

      letterSpacing:
        0.5,
    },

    kpiValue: {
      marginTop:
        8,

      fontSize:
        18,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    kpiSuffix: {
      marginTop:
        3,

      fontSize:
        7,

      color:
        COLORS.muted,
    },

    analysisBox: {
      marginTop:
        22,

      padding:
        16,

      borderRadius:
        8,

      backgroundColor:
        COLORS.light,

      borderLeftWidth:
        3,

      borderLeftColor:
        COLORS.red,
    },

    analysisTitle: {
      fontSize:
        9,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,

      marginBottom:
        8,
    },

    analysisItem: {
      flexDirection:
        "row",

      marginBottom:
        6,
    },

    analysisBullet: {
      width:
        12,

      fontSize:
        9,

      color:
        COLORS.red,
    },

    analysisText: {
      flex:
        1,

      fontSize:
        8.5,

      lineHeight:
        1.5,

      color:
        COLORS.text,
    },

    filterBox: {
      marginTop:
        18,

      padding:
        12,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      borderRadius:
        7,
    },

    filterTitle: {
      marginBottom:
        7,

      fontSize:
        8,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    filterText: {
      marginBottom:
        3,

      fontSize:
        7.5,

      color:
        COLORS.muted,
    },

    table: {
      marginTop:
        18,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      borderRadius:
        6,

      overflow:
        "hidden",
    },

    tableHeader: {
      flexDirection:
        "row",

      backgroundColor:
        "#F2F2F1",

      borderBottomWidth:
        1,

      borderBottomColor:
        COLORS.border,
    },

    tableRow: {
      flexDirection:
        "row",

      borderBottomWidth:
        1,

      borderBottomColor:
        "#EEEEEC",

      minHeight:
        28,

      alignItems:
        "center",
    },

    tableCell: {
      paddingVertical:
        7,

      paddingHorizontal:
        7,

      fontSize:
        7.2,

      color:
        COLORS.text,
    },

    tableHeaderCell: {
      paddingVertical:
        7,

      paddingHorizontal:
        7,

      fontSize:
        6.5,

      color:
        COLORS.muted,

      fontFamily:
        "Helvetica-Bold",

      textTransform:
        "uppercase",
    },

    paretoRow: {
      marginBottom:
        12,

      paddingBottom:
        10,

      borderBottomWidth:
        1,

      borderBottomColor:
        "#EFEFED",
    },

    paretoTitleRow: {
      flexDirection:
        "row",

      justifyContent:
        "space-between",

      alignItems:
        "center",
    },

    paretoLabel: {
      width:
        "58%",

      fontSize:
        8,

      fontFamily:
        "Helvetica-Bold",

      color:
        COLORS.dark,
    },

    paretoValue: {
      fontSize:
        7,

      color:
        COLORS.muted,
    },

    barTrack: {
      marginTop:
        6,

      height:
        8,

      borderRadius:
        4,

      backgroundColor:
        "#F0F0EF",

      overflow:
        "hidden",
    },

    barFill: {
      height:
        8,

      borderRadius:
        4,

      backgroundColor:
        COLORS.red,
    },

    paretoMeta: {
      marginTop:
        4,

      flexDirection:
        "row",

      justifyContent:
        "space-between",
    },

    paretoMetaText: {
      fontSize:
        6.5,

      color:
        COLORS.muted,
    },

    badge: {
      alignSelf:
        "flex-start",

      borderRadius:
        10,

      paddingVertical:
        3,

      paddingHorizontal:
        7,

      fontSize:
        6.5,

      fontFamily:
        "Helvetica-Bold",
    },

    criticalBadge: {
      backgroundColor:
        "#FCEBED",

      color:
        "#A8242C",
    },

    chronicBadge: {
      backgroundColor:
        "#FFF5DD",

      color:
        "#8B6814",
    },

    comfortBadge: {
      backgroundColor:
        "#EFF3F1",

      color:
        "#53635B",
    },

    warningBox: {
      marginTop:
        16,

      padding:
        10,

      borderRadius:
        6,

      backgroundColor:
        "#FFF8E7",

      borderWidth:
        1,

      borderColor:
        "#F0DDA7",
    },

    warningText: {
      fontSize:
        7,

      color:
        "#806517",

      lineHeight:
        1.4,
    },

    smallNote: {
      marginTop:
        12,

      fontSize:
        6.5,

      lineHeight:
        1.45,

      color:
        COLORS.muted,
    },
  });

/* =========================================================
   HELPERS
========================================================= */

function formatNumber(
  value: number,
  digits = 0,
) {
  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits,
    },
  );
}

function formatDate(
  value: string,
) {
  const [
    year,
    month,
    day,
  ] =
    value.split(
      "-",
    );

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(
  value: string,
) {
  return new Date(
    value,
  ).toLocaleString(
    "pt-BR",
  );
}

function getUnitLabel(
  data:
    MaintenanceReportData,
) {
  if (
    data.units.length === 1
  ) {
    const unit =
      data.units[0];

    return (
      unit.city ||
      unit.name
    );
  }

  return `${data.units.length} unidades selecionadas`;
}

function quadrantLabel(
  value:
    MaintenanceReportQuadrant,
) {
  switch (value) {
    case "CRITICO_CRONICO":
      return "Crítico-crônico";

    case "CRITICO":
      return "Crítico";

    case "CRONICO":
      return "Crônico";

    default:
      return "Conforto";
  }
}

/* =========================================================
   HEADER / FOOTER
========================================================= */

function Header({
  logoDataUri,
  data,
}: {
  logoDataUri:
    string | null;

  data:
    MaintenanceReportData;
}) {
  return (
    <View
      style={
        styles.internalHeader
      }
      fixed
    >
      {logoDataUri ? (
        <PdfImage
          src={
            logoDataUri
          }
          style={
            styles.headerLogo
          }
        />
      ) : (
        <Text
          style={
            styles.headerBrand
          }
        >
          COCA-COLA FEMSA
        </Text>
      )}

      <Text
        style={
          styles.headerText
        }
      >
        {formatDate(
          data.filters.startDate,
        )}
        {" — "}
        {formatDate(
          data.filters.endDate,
        )}
      </Text>
    </View>
  );
}

function Footer() {
  return (
    <View
      style={
        styles.footer
      }
      fixed
    >
      <Text
        style={
          styles.footerText
        }
      >
        Uso interno • Easy Maintenance
      </Text>

      <Text
        style={
          styles.footerText
        }
        render={({
          pageNumber,
          totalPages,
        }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <>
      <Text
        style={
          styles.sectionNumber
        }
      >
        {number}
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        {title}
      </Text>

      {description && (
        <Text
          style={
            styles.sectionDescription
          }
        >
          {description}
        </Text>
      )}

      <View
        style={
          styles.divider
        }
      />
    </>
  );
}

/* =========================================================
   KPI
========================================================= */

function KpiCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <View
      style={
        styles.kpiCard
      }
    >
      <Text
        style={
          styles.kpiLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.kpiValue
        }
      >
        {value}
      </Text>

      {suffix && (
        <Text
          style={
            styles.kpiSuffix
          }
        >
          {suffix}
        </Text>
      )}
    </View>
  );
}

/* =========================================================
   DOCUMENT
========================================================= */

export function MaintenanceReportPdf({
  data,
  logoDataUri,
}: MaintenanceReportPdfProps) {
  const selectedMetrics =
    new Set(
      data.filters.metrics,
    );

  const maxPareto =
    Math.max(
      ...data.pareto.map(
        (item) =>
          item.downtimeMinutes,
      ),
      1,
    );

  return (
    <Document
      title="Relatório de Confiabilidade e Manutenção"
      author={
        data.requestedBy
      }
      subject="Easy Maintenance"
      creator="Easy Maintenance"
    >
      {/* ===================================================
          COVER
      ==================================================== */}

      <Page
        size="A4"
        style={
          styles.cover
        }
      >
        <View
          style={
            styles.coverRedBar
          }
        />

        {logoDataUri ? (
          <PdfImage
            src={
              logoDataUri
            }
            style={
              styles.logo
            }
          />
        ) : (
          <Text
            style={
              styles.brandFallback
            }
          >
            Coca-Cola FEMSA
          </Text>
        )}

        <Text
          style={
            styles.coverLabel
          }
        >
          EASY MAINTENANCE
        </Text>

        <Text
          style={
            styles.coverTitle
          }
        >
          Relatório de Confiabilidade e Manutenção
        </Text>

        <Text
          style={
            styles.coverSubtitle
          }
        >
          Análise executiva do desempenho de manutenção industrial
        </Text>

        <View
          style={
            styles.coverRule
          }
        />

        <View
          style={
            styles.coverMeta
          }
        >
          <View
            style={
              styles.coverMetaRow
            }
          >
            <Text
              style={
                styles.coverMetaLabel
              }
            >
              Período
            </Text>

            <Text
              style={
                styles.coverMetaValue
              }
            >
              {formatDate(
                data.filters.startDate,
              )}
              {" a "}
              {formatDate(
                data.filters.endDate,
              )}
            </Text>
          </View>

          <View
            style={
              styles.coverMetaRow
            }
          >
            <Text
              style={
                styles.coverMetaLabel
              }
            >
              Escopo
            </Text>

            <Text
              style={
                styles.coverMetaValue
              }
            >
              {getUnitLabel(
                data,
              )}
            </Text>
          </View>

          <View
            style={
              styles.coverMetaRow
            }
          >
            <Text
              style={
                styles.coverMetaLabel
              }
            >
              Responsável
            </Text>

            <Text
              style={
                styles.coverMetaValue
              }
            >
              {data.requestedBy}
            </Text>
          </View>

          <View
            style={
              styles.coverMetaRow
            }
          >
            <Text
              style={
                styles.coverMetaLabel
              }
            >
              Emissão
            </Text>

            <Text
              style={
                styles.coverMetaValue
              }
            >
              {formatDateTime(
                data.generatedAt,
              )}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.coverFooter
          }
        >
          <View>
            <Text
              style={
                styles.coverFooterMain
              }
            >
              Easy Maintenance
            </Text>

            <Text
              style={
                styles.coverFooterSecondary
              }
            >
              Inteligência aplicada à manutenção industrial
            </Text>
          </View>

          <Text
            style={
              styles.coverFooterSecondary
            }
          >
            Uso interno
          </Text>
        </View>
      </Page>

      {/* ===================================================
          EXECUTIVE SUMMARY
      ==================================================== */}

      {selectedMetrics.has(
        "SUMMARY",
      ) && (
        <Page
          size="A4"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="01"
            title="Visão executiva"
            description="Síntese dos principais indicadores do período e do escopo selecionado."
          />

          <View
            style={
              styles.kpiGrid
            }
          >
            <KpiCard
              label="Ocorrências"
              value={
                formatNumber(
                  data.summary.events,
                )
              }
              suffix="eventos registrados"
            />

            <KpiCard
              label="Tempo de parada"
              value={
                formatNumber(
                  data.summary
                    .downtimeMinutes,
                  1,
                )
              }
              suffix="minutos"
            />

            <KpiCard
              label="MTTR"
              value={
                formatNumber(
                  data.summary
                    .mttrMinutes,
                  1,
                )
              }
              suffix="minutos por ocorrência"
            />

            <KpiCard
              label="Equipamentos"
              value={
                formatNumber(
                  data.summary.equipments,
                )
              }
              suffix="itens com apontamentos"
            />

            <KpiCard
              label="Linhas"
              value={
                formatNumber(
                  data.summary.lines,
                )
              }
              suffix="linhas analisadas"
            />

            <KpiCard
              label="Média por evento"
              value={
                formatNumber(
                  data.summary
                    .averageDowntimeMinutes,
                  1,
                )
              }
              suffix="minutos"
            />
          </View>

          <View
            style={
              styles.analysisBox
            }
          >
            <Text
              style={
                styles.analysisTitle
              }
            >
              Leitura executiva
            </Text>

            {data.executiveAnalysis.map(
              (
                text,
                index,
              ) => (
                <View
                  key={
                    `${text}-${index}`
                  }
                  style={
                    styles.analysisItem
                  }
                >
                  <Text
                    style={
                      styles.analysisBullet
                    }
                  >
                    •
                  </Text>

                  <Text
                    style={
                      styles.analysisText
                    }
                  >
                    {text}
                  </Text>
                </View>
              ),
            )}
          </View>

          <View
            style={
              styles.filterBox
            }
          >
            <Text
              style={
                styles.filterTitle
              }
            >
              Escopo utilizado
            </Text>

            <Text
              style={
                styles.filterText
              }
            >
              Unidades:{" "}
              {data.units
                .map(
                  (unit) =>
                    unit.city ||
                    unit.name,
                )
                .join(", ")}
            </Text>

            <Text
              style={
                styles.filterText
              }
            >
              Linha:{" "}
              {data.filters.line ||
                "Todas"}
            </Text>

            <Text
              style={
                styles.filterText
              }
            >
              Equipamento:{" "}
              {data.filters
                .equipment ||
                "Todos"}
            </Text>
          </View>
        </Page>
      )}

      {/* ===================================================
          UNIT COMPARISON
      ==================================================== */}

      {selectedMetrics.has(
        "UNIT_COMPARISON",
      ) && (
        <Page
          size="A4"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="02"
            title="Comparativo entre unidades"
            description="Visão comparativa de ocorrências, downtime e MTTR por unidade operacional."
          />

          <View
            style={
              styles.table
            }
          >
            <View
              style={
                styles.tableHeader
              }
            >
              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "34%",
                  },
                ]}
              >
                Unidade
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "16%",
                  },
                ]}
              >
                Código
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "16%",
                  },
                ]}
              >
                Eventos
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "20%",
                  },
                ]}
              >
                Downtime
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "14%",
                  },
                ]}
              >
                MTTR
              </Text>
            </View>

            {data.unitComparison.map(
              (item) => (
                <View
                  key={
                    item.unitId
                  }
                  style={
                    styles.tableRow
                  }
                  wrap={false}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "34%",
                      },
                    ]}
                  >
                    {item.city ||
                      item.name}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "16%",
                      },
                    ]}
                  >
                    {item.code ||
                      "—"}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "16%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.events,
                    )}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "20%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.downtimeMinutes,
                      1,
                    )}{" "}
                    min
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "14%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.mttrMinutes,
                      1,
                    )}{" "}
                    min
                  </Text>
                </View>
              ),
            )}
          </View>
        </Page>
      )}

      {/* ===================================================
          PARETO
      ==================================================== */}

      {selectedMetrics.has(
        "PARETO",
      ) && (
        <Page
          size="A4"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="03"
            title="Pareto de tempo de parada"
            description="Todos os equipamentos do recorte são preservados. Não há agrupamento artificial em “Outros”."
          />

          {data.pareto.map(
            (item) => {
              const barWidth =
                maxPareto > 0
                  ? Math.max(
                      1,
                      (
                        item.downtimeMinutes /
                        maxPareto
                      ) * 100,
                    )
                  : 0;

              return (
                <View
                  key={
                    `${item.rank}-${item.label}`
                  }
                  style={
                    styles.paretoRow
                  }
                  wrap={false}
                >
                  <View
                    style={
                      styles.paretoTitleRow
                    }
                  >
                    <Text
                      style={
                        styles.paretoLabel
                      }
                    >
                      {item.rank}.{" "}
                      {item.label}
                    </Text>

                    <Text
                      style={
                        styles.paretoValue
                      }
                    >
                      {formatNumber(
                        item.downtimeMinutes,
                        1,
                      )}{" "}
                      min
                    </Text>
                  </View>

                  <View
                    style={
                      styles.barTrack
                    }
                  >
                    <View
                      style={[
                        styles.barFill,
                        {
                          width:
                            `${barWidth}%`,
                        },
                      ]}
                    />
                  </View>

                  <View
                    style={
                      styles.paretoMeta
                    }
                  >
                    <Text
                      style={
                        styles.paretoMetaText
                      }
                    >
                      {formatNumber(
                        item.occurrences,
                      )}{" "}
                      ocorrências •{" "}
                      {formatNumber(
                        item.percentage,
                        1,
                      )}
                      % do total
                    </Text>

                    <Text
                      style={
                        styles.paretoMetaText
                      }
                    >
                      {formatNumber(
                        item.cumulativePercentage,
                        1,
                      )}
                      % acumulado
                    </Text>
                  </View>
                </View>
              );
            },
          )}
        </Page>
      )}

      {/* ===================================================
          JACK-KNIFE
      ==================================================== */}

      {selectedMetrics.has(
        "JACK_KNIFE",
      ) && (
        <Page
          size="A4"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="04"
            title="Jack-Knife"
            description={`Limites do recorte: frequência ${formatNumber(
              data.jackKnifeLimits
                .frequency,
            )} e MTTR ${formatNumber(
              data.jackKnifeLimits
                .mttrMinutes,
              1,
            )} min.`}
          />

          <View
            style={
              styles.table
            }
          >
            <View
              style={
                styles.tableHeader
              }
            >
              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "40%",
                  },
                ]}
              >
                Equipamento
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "15%",
                  },
                ]}
              >
                Falhas
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "18%",
                  },
                ]}
              >
                MTTR
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "27%",
                  },
                ]}
              >
                Quadrante
              </Text>
            </View>

            {data.jackKnife.map(
              (
                item,
                index,
              ) => (
                <View
                  key={
                    `${item.label}-${index}`
                  }
                  style={
                    styles.tableRow
                  }
                  wrap={false}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "40%",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "15%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.frequency,
                    )}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "18%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.mttrMinutes,
                      1,
                    )}{" "}
                    min
                  </Text>

                  <View
                    style={{
                      width:
                        "27%",

                      paddingVertical:
                        5,

                      paddingHorizontal:
                        6,
                    }}
                  >
                    <Text
                      style={[
                        styles.badge,

                        item.quadrant ===
                          "CRITICO" ||
                        item.quadrant ===
                          "CRITICO_CRONICO"
                          ? styles.criticalBadge
                          : item.quadrant ===
                              "CRONICO"
                            ? styles.chronicBadge
                            : styles.comfortBadge,
                      ]}
                    >
                      {quadrantLabel(
                        item.quadrant,
                      )}
                    </Text>
                  </View>
                </View>
              ),
            )}
          </View>
        </Page>
      )}

      {/* ===================================================
          DIAGNOSTIC
      ==================================================== */}

      {(
        selectedMetrics.has(
          "CRITICALITY",
        ) ||
        selectedMetrics.has(
          "FAILURE_MODES",
        )
      ) && (
        <Page
          size="A4"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="05"
            title="Diagnóstico de manutenção"
            description="Consolidação de criticidade e modos de falha do período selecionado."
          />

          {selectedMetrics.has(
            "CRITICALITY",
          ) && (
            <>
              <Text
                style={
                  styles.analysisTitle
                }
              >
                Criticidade dos equipamentos
              </Text>

              <View
                style={
                  styles.table
                }
              >
                <View
                  style={
                    styles.tableHeader
                  }
                >
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "30%",
                      },
                    ]}
                  >
                    Criticidade
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "30%",
                      },
                    ]}
                  >
                    Eventos
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "40%",
                      },
                    ]}
                  >
                    Downtime
                  </Text>
                </View>

                {data.criticality.map(
                  (item) => (
                    <View
                      key={
                        item.criticality
                      }
                      style={
                        styles.tableRow
                      }
                    >
                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "30%",
                          },
                        ]}
                      >
                        {item.criticality}
                      </Text>

                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "30%",
                          },
                        ]}
                      >
                        {formatNumber(
                          item.events,
                        )}
                      </Text>

                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "40%",
                          },
                        ]}
                      >
                        {formatNumber(
                          item.downtimeMinutes,
                          1,
                        )}{" "}
                        min
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </>
          )}

          {selectedMetrics.has(
            "FAILURE_MODES",
          ) && (
            <View
              style={{
                marginTop:
                  selectedMetrics.has(
                    "CRITICALITY",
                  )
                    ? 28
                    : 0,
              }}
            >
              <Text
                style={
                  styles.analysisTitle
                }
              >
                Modos de falha
              </Text>

              <View
                style={
                  styles.table
                }
              >
                <View
                  style={
                    styles.tableHeader
                  }
                >
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "54%",
                      },
                    ]}
                  >
                    Modo de falha
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "18%",
                      },
                    ]}
                  >
                    Eventos
                  </Text>

                  <Text
                    style={[
                      styles.tableHeaderCell,
                      {
                        width:
                          "28%",
                      },
                    ]}
                  >
                    Downtime
                  </Text>
                </View>

                {data.failureModes.map(
                  (
                    item,
                    index,
                  ) => (
                    <View
                      key={
                        `${item.label}-${index}`
                      }
                      style={
                        styles.tableRow
                      }
                      wrap={false}
                    >
                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "54%",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>

                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "18%",
                          },
                        ]}
                      >
                        {formatNumber(
                          item.events,
                        )}
                      </Text>

                      <Text
                        style={[
                          styles.tableCell,
                          {
                            width:
                              "28%",
                          },
                        ]}
                      >
                        {formatNumber(
                          item.downtimeMinutes,
                          1,
                        )}{" "}
                        min
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </View>
          )}
        </Page>
      )}

      {/* ===================================================
          DETAILS
      ==================================================== */}

      {selectedMetrics.has(
        "DETAILS",
      ) && (
        <Page
          size="A4"
          orientation="landscape"
          style={
            styles.page
          }
          wrap
        >
          <Header
            logoDataUri={
              logoDataUri
            }
            data={data}
          />

          <Footer />

          <SectionHeader
            number="ANEXO"
            title="Apontamentos detalhados"
            description="Relação dos eventos que compõem o recorte selecionado."
          />

          {data.detailsTruncated && (
            <View
              style={
                styles.warningBox
              }
            >
              <Text
                style={
                  styles.warningText
                }
              >
                O anexo foi limitado aos
                2.000 registros mais recentes
                para preservar o desempenho
                da geração do PDF.
              </Text>
            </View>
          )}

          <View
            style={
              styles.table
            }
          >
            <View
              style={
                styles.tableHeader
              }
            >
              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "10%",
                  },
                ]}
              >
                Data
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "14%",
                  },
                ]}
              >
                Unidade
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "12%",
                  },
                ]}
              >
                Linha
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "21%",
                  },
                ]}
              >
                Equipamento
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "19%",
                  },
                ]}
              >
                Falha
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "14%",
                  },
                ]}
              >
                Observação
              </Text>

              <Text
                style={[
                  styles.tableHeaderCell,
                  {
                    width:
                      "10%",
                  },
                ]}
              >
                Parada
              </Text>
            </View>

            {data.details.map(
              (item) => (
                <View
                  key={
                    item.id
                  }
                  style={
                    styles.tableRow
                  }
                  wrap={false}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "10%",
                      },
                    ]}
                  >
                    {formatDate(
                      item.eventDate,
                    )}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "14%",
                      },
                    ]}
                  >
                    {item.unit}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "12%",
                      },
                    ]}
                  >
                    {item.line ||
                      "—"}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "21%",
                      },
                    ]}
                  >
                    {item.equipment ||
                      "—"}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "19%",
                      },
                    ]}
                  >
                    {item.failureMode ||
                      "Não classificado"}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "14%",
                      },
                    ]}
                  >
                    {item.observation ||
                      "—"}
                  </Text>

                  <Text
                    style={[
                      styles.tableCell,
                      {
                        width:
                          "10%",
                      },
                    ]}
                  >
                    {formatNumber(
                      item.downtimeMinutes,
                      1,
                    )}{" "}
                    min
                  </Text>
                </View>
              ),
            )}
          </View>

          <Text
            style={
              styles.smallNote
            }
          >
            Documento gerado automaticamente
            pelo Easy Maintenance a partir
            dos registros disponíveis no
            banco de dados.
          </Text>
        </Page>
      )}
    </Document>
  );
}