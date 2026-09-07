package it.pizzeria.gestionale.controller;

import java.util.List;

public class NuovoOrdineRequest {

    private String tavoloOCliente;
    private List<RigaRequest> righe;
    private String note;

    public String getTavoloOCliente() {
        return tavoloOCliente;
    }

    public void setTavoloOCliente(String tavoloOCliente) {
        this.tavoloOCliente = tavoloOCliente;
    }

    public List<RigaRequest> getRighe() {
        return righe;
    }

    public void setRighe(List<RigaRequest> righe) {
        this.righe = righe;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public static class RigaRequest {
        private String prodotto;
        private List<?> extra;

        public String getProdotto() {
            return prodotto;
        }

        public void setProdotto(String prodotto) {
            this.prodotto = prodotto;
        }

        public List<?> getExtra() {
            return extra;
        }

        public void setExtra(List<?> extra) {
            this.extra = extra;
        }
    }
}