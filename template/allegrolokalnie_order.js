let Current = {"ModalMenu": false}
let Events = {
    ".ml-modal-v2-close-icon,.ml-clear-btn": function() {
        ToggleRemoveModal()
    },

    "button[data-testid='remove-cart-item-confirmation-delete']": function() {
        Redirect2(false)
    },

    "button[data-testid='remove-cart-item-confirmation-follow']": function() {
        AddToFavorites()
    },

    "a[data-testid='delivery-payment-button']": function() {
        Redirect("zakup")
    }
}


function ToggleRemoveModal() {
    $(`#headlessui-dialog-1`).toggle()
}

function AddToFavorites() {
    $(`div[data-testid="remove-cart-banner"]`).show()
    $(`use[href="/assets/fonts/icons.svg#heart-empty"]`).attr("href", "/assets/fonts/icons.svg#heart-filled")
    Cookies.set("IsFavorite", 1)
}

$(document).ready(function() {
    $(document).on("click", function(e) {
        if (e.target.className == "ml-modal-v2__panel-wrapper") {
            ToggleRemoveModal()
        }
    })
})