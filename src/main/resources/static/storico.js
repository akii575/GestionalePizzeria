const storicoPage = (() => {
    const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const wholeEuro = new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
    });
    const integer = new Intl.NumberFormat("it-IT");
    const dateFormatter = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Rome"
    });
    const shortWeekday = new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        timeZone: "Europe/Rome"
    });
    const shortDate = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Rome"
    });
    const longDate = new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Rome"
    });
    const chartTypes = [
        { key: "tavolo", label: "Tavoli", color: "#1a5ea9" },
        { key: "consegna", label: "Consegne", color: "#bf4a42" },
        { key: "ritiro", label: "Ritiri", color: "#e4b034" },
        { key: "banco", label: "Banco", color: "#4b8f69" }
    ];

    function dateFromKey(value) {
        const date = new Date(`${value}T12:00:00Z`);
        if (Number.isNaN(date.valueOf()) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error("Intervallo di date non valido.");
        }
        return date;
    }

    function dateKey(date) {
        return [
            String(date.getUTCFullYear()).padStart(4, "0"),
            String(date.getUTCMonth() + 1).padStart(2, "0"),
            String(date.getUTCDate()).padStart(2, "0")
        ].join("-");
    }

    function shouldShowTotals(chartWidth, days) {
        return Number.isFinite(chartWidth)
            && Number.isInteger(days)
            && days > 0
            && chartWidth / days >= 34;
    }

    function prepareChartData(source, startDate, endDate, currentServiceDay) {
        const start = dateFromKey(startDate);
        const end = dateFromKey(endDate);
        if (start > end) throw new Error("L'intervallo di date non è valido.");
        const byDate = new Map(source.map(day => [day.data, day]));
        const days = [];
        for (const cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            const date = dateKey(cursor);
            const saved = byDate.get(date);
            const perTipo = Object.fromEntries(chartTypes.map(type => {
                const values = saved?.perTipo?.[type.key] || {};
                return [type.key, {
                    comande: Number(values.comande) || 0,
                    incasso: Number(values.incasso) || 0
                }];
            }));
            days.push({
                data: date,
                incasso: Number(saved?.incasso) || 0,
                comande: Number(saved?.comande) || 0,
                coperti: Number(saved?.coperti) || 0,
                perTipo,
                inCorso: date === currentServiceDay
            });
        }
        return days;
    }

    function serviceDayNow() {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Rome",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            hourCycle: "h23"
        }).formatToParts(new Date()).reduce((result, part) => {
            if (part.type !== "literal") result[part.type] = Number(part.value);
            return result;
        }, {});
        const date = new Date(0);
        date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
        date.setUTCHours(0, 0, 0, 0);
        if (parts.hour < 5) date.setUTCDate(date.getUTCDate() - 1);
        return dateKey(date);
    }

    function displayDate(value) {
        return dateFormatter.format(dateFromKey(value));
    }

    function shortDateLabel(value, isCurrent) {
        const date = dateFromKey(value);
        const weekday = shortWeekday.format(date).replace(/\.$/, "").toLocaleLowerCase("it-IT");
        const label = `${weekday} ${shortDate.format(date)}`;
        return isCurrent ? [label, "oggi"] : label;
    }

    async function initialize() {
        let chart;
        let giornate = [];

        function setRange(days) {
            const end = serviceDayNow();
            const startDate = dateFromKey(end);
            startDate.setUTCDate(startDate.getUTCDate() - days + 1);
            document.getElementById("storico-da").value = dateKey(startDate);
            document.getElementById("storico-a").value = end;
            document.querySelectorAll(".storico-presets button").forEach(button => {
                button.setAttribute("aria-pressed", String(Number(button.dataset.days) === days));
            });
            loadHistory();
        }

        function renderMetrics(data) {
            document.getElementById("storico-incasso").textContent = money.format(data.totali.incasso);
            document.getElementById("storico-comande").textContent = integer.format(data.totali.comande);
            document.getElementById("storico-scontrino").textContent = money.format(data.totali.scontrinoMedio);
            document.getElementById("storico-coperti").textContent = integer.format(data.totali.coperti);

            const previousHasData = Number(data.periodoPrecedente.comande) > 0;
            const previous = Number(data.periodoPrecedente.incasso) || 0;
            const change = previous === 0
                ? data.totali.incasso === 0 ? 0 : null
                : ((data.totali.incasso - previous) / Math.abs(previous)) * 100;
            const variation = document.getElementById("storico-variazione");
            variation.className = "";
            variation.textContent = !previousHasData
                ? "Nessun dato nel periodo precedente"
                : change === null
                    ? "vs periodo precedente · n/d"
                    : `vs periodo precedente · ${change > 0 ? "+" : ""}${change.toLocaleString("it-IT", {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1
                    })}%`;
            if (change > 0) variation.classList.add("storico-variazione--positiva");
            if (change < 0) variation.classList.add("storico-variazione--negativa");
        }

        const totalsPlugin = {
            id: "storico-total-and-current-day",
            afterDatasetsDraw(instance) {
                const x = instance.scales.x;
                const y = instance.scales.y;
                const context = instance.ctx;
                context.save();
                context.textAlign = "center";
                context.textBaseline = "bottom";
                context.font = "600 11px Poppins, sans-serif";

                giornate.forEach((giornata, index) => {
                    const xPosition = x.getPixelForValue(index);
                    const yPosition = y.getPixelForValue(giornata.incasso);
                    if (giornata.inCorso) {
                        const bar = instance.getDatasetMeta(0).data[index];
                        const width = Number(bar?.width) || 24;
                        const base = y.getPixelForValue(0);
                        const top = giornata.incasso > 0 ? yPosition : base - 8;
                        context.strokeStyle = "#1b2b25";
                        context.lineWidth = 1.5;
                        context.setLineDash([4, 3]);
                        context.strokeRect(
                            xPosition - width / 2 - 2,
                            top - 2,
                            width + 4,
                            Math.max(base - top, 4) + 4
                        );
                        context.setLineDash([]);
                    }
                    if (giornate.length <= 31
                        && shouldShowTotals(instance.chartArea.width, giornate.length)
                        && giornata.incasso > 0) {
                        context.fillStyle = "#1b2b25";
                        context.fillText(wholeEuro.format(giornata.incasso), xPosition, yPosition - 5);
                    }
                });
                context.restore();
            }
        };

        function showDetails(giornata) {
            const dialog = document.getElementById("storico-dettaglio");
            const title = document.getElementById("storico-dettaglio-titolo");
            title.textContent = `Giornata ${displayDate(giornata.data)}`;
            const content = document.getElementById("storico-dettaglio-contenuto");
            content.replaceChildren();

            const table = document.createElement("table");
            const head = document.createElement("thead");
            const heading = document.createElement("tr");
            for (const label of ["Tipo", "Comande", "Incasso"]) {
                const cell = document.createElement("th");
                cell.scope = "col";
                cell.textContent = label;
                heading.append(cell);
            }
            head.append(heading);
            table.append(head);

            const body = document.createElement("tbody");
            for (const type of chartTypes) {
                const row = document.createElement("tr");
                const name = document.createElement("th");
                name.scope = "row";
                name.textContent = type.label;
                const count = document.createElement("td");
                count.textContent = integer.format(giornata.perTipo[type.key].comande);
                const revenue = document.createElement("td");
                revenue.textContent = money.format(giornata.perTipo[type.key].incasso);
                row.append(name, count, revenue);
                body.append(row);
            }
            table.append(body);
            const foot = document.createElement("tfoot");
            const totalRow = document.createElement("tr");
            const totalLabel = document.createElement("th");
            totalLabel.scope = "row";
            totalLabel.textContent = "Totale";
            const totalCount = document.createElement("td");
            totalCount.textContent = integer.format(giornata.comande);
            const totalRevenue = document.createElement("td");
            totalRevenue.textContent = money.format(giornata.incasso);
            totalRow.append(totalLabel, totalCount, totalRevenue);
            foot.append(totalRow);
            table.append(foot);
            const covers = document.createElement("p");
            covers.className = "storico-dialog__coperti";
            covers.textContent = `Coperti: ${integer.format(giornata.coperti)}`;
            content.append(table, covers);
            dialog.showModal();
        }

        function drawChart() {
            if (chart) chart.destroy();
            chart = new window.Chart(document.getElementById("storico-chart"), {
                type: "bar",
                data: {
                    labels: giornate.map(giornata => shortDateLabel(giornata.data, giornata.inCorso)),
                    datasets: chartTypes.map(type => ({
                        label: type.label,
                        data: giornate.map(giornata => giornata.perTipo[type.key].incasso),
                        backgroundColor: type.color,
                        borderColor: "transparent",
                        borderWidth: 0,
                        borderRadius: 2,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9,
                        maxBarThickness: 36,
                        stack: "incasso"
                    }))
                },
                plugins: [totalsPlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: giornate.length <= 31 ? 20 : 4, right: 24 } },
                    interaction: { mode: "index", intersect: false },
                    onClick(event, elements) {
                        if (elements.length) showDetails(giornate[elements[0].index]);
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title(items) {
                                    return longDate.format(dateFromKey(giornate[items[0].dataIndex].data));
                                },
                                label(item) {
                                    const type = chartTypes[item.datasetIndex];
                                    const values = giornate[item.dataIndex].perTipo[type.key];
                                    return `${type.label}: ${money.format(values.incasso)} · ${integer.format(values.comande)} comande`;
                                },
                                footer(items) {
                                    const giornata = giornate[items[0].dataIndex];
                                    return `Totale giornata: ${money.format(giornata.incasso)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false },
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: window.innerWidth < 600 ? 6 : undefined,
                                minRotation: 0,
                                maxRotation: 0
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            maxTicksLimit: 6,
                            ticks: {
                                maxTicksLimit: 6,
                                callback(value) {
                                    return wholeEuro.format(value);
                                }
                            },
                            grid: { color: "rgba(27, 43, 37, .08)" }
                        }
                    }
                }
            });
        }

        async function loadHistory() {
            const status = document.getElementById("storico-status");
            const empty = document.getElementById("storico-vuoto");
            const graph = document.getElementById("storico-grafico");
            status.textContent = "";
            empty.hidden = true;
            graph.hidden = true;
            try {
                const startDate = document.getElementById("storico-da").value;
                const endDate = document.getElementById("storico-a").value;
                const params = new URLSearchParams({ da: startDate, a: endDate });
                const response = await fetch(`/api/storico?${params}`, { credentials: "same-origin" });
                const data = await response.json();
                if (!response.ok) throw new Error(data.errore || "Impossibile caricare lo storico.");
                renderMetrics(data);
                if (data.serate.length === 0) {
                    giornate = [];
                    empty.hidden = false;
                    if (chart) {
                        chart.destroy();
                        chart = null;
                    }
                    return;
                }
                giornate = prepareChartData(data.serate, startDate, endDate, serviceDayNow());
                graph.hidden = false;
                drawChart();
            } catch (error) {
                status.textContent = error.message || "Impossibile caricare lo storico.";
            }
        }

        document.querySelectorAll(".storico-presets button").forEach(button => {
            button.addEventListener("click", () => setRange(Number(button.dataset.days)));
        });
        document.getElementById("storico-periodo").addEventListener("submit", event => {
            event.preventDefault();
            document.querySelectorAll(".storico-presets button")
                .forEach(button => button.setAttribute("aria-pressed", "false"));
            loadHistory();
        });
        document.getElementById("storico-dettaglio-chiudi")
            .addEventListener("click", () => document.getElementById("storico-dettaglio").close());
        window.addEventListener("resize", () => {
            if (!chart) return;
            chart.options.scales.x.ticks.maxTicksLimit = window.innerWidth < 600 ? 6 : undefined;
            chart.resize();
        });

        if (!window.authReady || await window.authReady) setRange(30);
    }

    return Object.freeze({ initialize, prepareChartData, shouldShowTotals });
})();

if (typeof module !== "undefined" && module.exports) module.exports = storicoPage;
if (typeof window !== "undefined") window.storicoPage = storicoPage;
if (typeof document !== "undefined") void storicoPage.initialize();
