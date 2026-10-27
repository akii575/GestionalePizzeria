const mapsUI = (() => {
    function urlsForAddress(value) {
        const query = encodeURIComponent(String(value ?? "").trim());
        return {
            google: `https://www.google.com/maps/search/?api=1&query=${query}`,
            apple: `https://maps.apple.com/?q=${query}`
        };
    }

    function getDialog() {
        let dialog = document.getElementById("app-mappe-dialog");
        if (dialog) return dialog;

        dialog = document.createElement("dialog");
        dialog.id = "app-mappe-dialog";
        dialog.className = "app-mappe-dialog";
        dialog.setAttribute("aria-labelledby", "app-mappe-titolo");
        dialog.innerHTML = `
            <form method="dialog" class="app-mappe-chiudi"><button type="submit" aria-label="Chiudi">×</button></form>
            <h2 id="app-mappe-titolo">Apri indirizzo</h2>
            <p id="app-mappe-indirizzo"></p>
            <div class="app-mappe-opzioni">
                <a id="app-mappe-google" class="app-mappe-scelta">Google Maps <span>Apri nell'app o nel browser</span></a>
                <a id="app-mappe-apple" class="app-mappe-scelta">Mappe Apple <span>Apri nell'app o nel browser</span></a>
            </div>
            <p class="app-mappe-nota">Le app disponibili e il selettore dipendono dal dispositivo e dal browser.</p>
        `;
        document.body.append(dialog);
        return dialog;
    }

    function openAddress(value) {
        const address = String(value ?? "").trim();
        if (!address || address === "—") return false;

        const dialog = getDialog();
        const urls = urlsForAddress(address);
        dialog.querySelector("#app-mappe-indirizzo").textContent = address;
        dialog.querySelector("#app-mappe-google").href = urls.google;
        dialog.querySelector("#app-mappe-apple").href = urls.apple;
        if (!dialog.open) {
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
        }
        return true;
    }

    function initialize(root) {
        root.addEventListener("click", event => {
            const target = event.target;
            const button = target && typeof target.closest === "function"
                ? target.closest("[data-indirizzo]")
                : null;
            if (button) {
                event.preventDefault();
                openAddress(button.dataset.indirizzo);
                return;
            }

            const dialog = document.getElementById("app-mappe-dialog");
            if (dialog && target === dialog) {
                if (typeof dialog.close === "function") dialog.close();
                else dialog.removeAttribute("open");
            }
        });
    }

    return Object.freeze({ initialize, openAddress, urlsForAddress });
})();

if (typeof module !== "undefined" && module.exports) module.exports = mapsUI;
if (typeof window !== "undefined") window.mapsUI = mapsUI;
if (typeof document !== "undefined") mapsUI.initialize(document);
