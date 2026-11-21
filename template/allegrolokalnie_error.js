let Current = {};
let Events = {
    ".mlc-payment-error__cta": function() {
        Redirect("platnosc")
    }
};
let Errors = {
    "BLIK": {
        "2": "Błąd podczas przetwarzania płatności. Twoje środki zostaną zwrócone w ciągu 48h. Spróbuj ponownie",
        "3": "Kwota zamówienia przekracza limit na transakcje w twoim banku. Zwiększ limit oraz spróbuj ponownie.",
        "4": "Podany kod BLIK jest błędny, wygeneruj nowy kod i spróbuj ponownie."
    },
    "Card": {
        "2": "Błąd podczas przetwarzania płatności. Twoje środki zostaną zwrócone w ciągu 48h. Spróbuj ponownie",
        "3": "Kwota zamówienia przekracza limit na transakcje w twoim banku. Zwiększ limit oraz spróbuj ponownie.",
        "4": "Płatność została odrzucona, zweryfikuj poprawność danych karty płatniczej."
    }
};

function LoadError() {
    const cachedError = Cookies.get("AllegroLokalnie_Payment_Error");
    const cachedPayment = Cookies.get("AllegroLokalnie_Payment_Error_Payment") || "BLIK";

    if (cachedError != undefined) {
        const errors = Errors[cachedPayment] || Errors["BLIK"];
        if (errors && errors[cachedError]) {
            $(`.mlc-payment-error__description`).text(errors[cachedError]);
        }
    }
}

$(document).ready(function() {
    LoadError()
})
