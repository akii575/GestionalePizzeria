(async () => {
    const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
    const integer = new Intl.NumberFormat("it-IT");
    const dateFormatter = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Rome"
    });
    const chartTypes = [
        { key: "tavolo", label: "Tavoli", color: "#1a5ea9", activeColor: "#4b91da" },
        { key: "consegna", label: "Consegne", color: "#bf4a42", activeColor: "#e87a70" },
        { key: "ritiro", label: "Ritiri", color: "#e4b034", activeColor: "#f4ce69" },
        { key: "banco", label: "Banco", color: "#4b8f69", activeColor: "#7bb48f" }
    ];
    let chart;
    let serate = [];

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

    function dateKey(date) {
        return [
            String(date.getUTCFullYear()).padStart(4, "0"),
            String(date.getUTCMonth() + 1).padStart(2, "0"),
            String(date.getUTCDate()).padStart(2, "0")
        ].join("-");
    }

    function dateLabel(value) {
        return dateFormatter.format(new Date(`${value}T12:00:00+02:00`));
    }

    function setRange(days) {
        const end = serviceDayNow();
        const startDate = new Date(`${end}T00:00:00Z`);
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

        const previous = data.periodoPrecedente.incasso;
        const change = previous === 0
            ? data.totali.incasso === 0 ? 0 : null
            : ((data.totali.incasso - previous) / Math.abs(previous)) * 100;
        const variation = document.getElementById("storico-variazione");
        variation.className = "";
        variation.textContent = change === null
            ? "vs periodo precedente · n/d"
            : `vs periodo precedente · ${change > 0 ? "+" : ""}${change.toLocaleString("it-IT", {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1
            })}%`;
        if (change > 0) variation.classList.add("storico-variazione--positiva");
        if (change < 0) variation.classList.add("storico-variazione--negativa");
    }

    function drawChart() {
        const wrapper = document.getElementById("storico-chart-inner");
        wrapper.style.minWidth = `${Math.max(640, serate.length * 76)}px`;
        if (chart) chart.destroy();
        chart = new window.Chart(document.getElementById("storico-chart"), {
            type: "bar",
            data: {
                labels: serate.map(serata => serata.inCorso
                    ? [dateLabel(serata.data), "in corso"]
                    : dateLabel(serata.data)),
                datasets: chartTypes.map(type => ({
                    label: type.label,
                    data: serate.map(serata => serata.perTipo[type.key].incasso),
                    backgroundColor: serate.map(serata => serata.inCorso ? type.activeColor : type.color),
                    borderColor: serate.map(serata => serata.inCorso ? type.color : "transparent"),
                    borderWidth: serate.map(serata => serata.inCorso ? 2 : 0),
                    borderRadius: 3,
                    stack: "incasso"
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                onClick(event, elements) {
                    if (elements.length) showDetails(serate[elements[0].index]);
                },
                plugins: {
                    legend: { position: "bottom", labels: { usePointStyle: true, padding: 18 } },
                    tooltip: {
                        callbacks: {
                            title(items) {
                                const evening = serate[items[0].dataIndex];
                                return `${dateLabel(evening.data)}${evening.inCorso ? " · in corso" : ""}`;
                            },
                            label(item) {
                                return `${item.dataset.label}: ${money.format(item.parsed.y)}`;
                            },
                            footer(items) {
                                const evening = serate[items[0].dataIndex];
                                return `Totale: ${money.format(evening.incasso)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback(value) {
                                return money.format(value);
                            }
                        }
                    }
                }
            }
        });
    }

    function showDetails(evening) {
        const dialog = document.getElementById("storico-dettaglio");
        const title = document.getElementById("storico-dettaglio-titolo");
        title.textContent = `Serata ${dateLabel(evening.data)}${evening.inCorso ? " · in corso" : ""}`;
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
            count.textContent = integer.format(evening.perTipo[type.key].comande);
            const revenue = document.createElement("td");
            revenue.textContent = money.format(evening.perTipo[type.key].incasso);
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
        totalCount.textContent = integer.format(evening.comande);
        const totalRevenue = document.createElement("td");
        totalRevenue.textContent = money.format(evening.incasso);
        totalRow.append(totalLabel, totalCount, totalRevenue);
        foot.append(totalRow);
        table.append(foot);
        const covers = document.createElement("p");
        covers.className = "storico-dialog__coperti";
        covers.textContent = `Coperti: ${integer.format(evening.coperti)}`;
        content.append(table, covers);
        dialog.showModal();
    }

    async function loadHistory() {
        const status = document.getElementById("storico-status");
        const empty = document.getElementById("storico-vuoto");
        const graph = document.getElementById("storico-grafico");
        status.textContent = "";
        empty.hidden = true;
        graph.hidden = true;
        try {
            const params = new URLSearchParams({
                da: document.getElementById("storico-da").value,
                a: document.getElementById("storico-a").value
            });
            const response = await fetch(`/api/storico?${params}`, { credentials: "same-origin" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.errore || "Impossibile caricare lo storico.");
            serate = data.serate;
            renderMetrics(data);
            if (serate.length === 0) {
                empty.hidden = false;
                if (chart) {
                    chart.destroy();
                    chart = null;
                }
                return;
            }
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

    if (!window.authReady || await window.authReady) setRange(30);
})();
