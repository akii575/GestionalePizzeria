const numero = new URLSearchParams(window.location.search).get("numero") || "";
window.location.replace("/ordini.html?modifica=" + encodeURIComponent(numero));
