let State = {"FullScreen": false, "DraggingPhoto": false};
let Loaded = {"Photo": 0};
let Current = {"Photo": 0, "ModalMenu": false};
let MessengerID = Cookies.get("MessengerID");
let LoadedMessages = 0;

let MessageTemplate = {
    0: `<div class="mlc-message__container"><div class="mlc-message__information"><div class="mlc-message mlc-message--text mlc-message--mine">%MESSAGE_TEXT%</div><time class="mlc-message-status mlc-message-status--mine"><div class="mlc-message-status__icon"><span class="ml-icon ml-icon--gray ml-icon--small"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" id="check-line" d="M9.99999 15.172L19.192 5.979L20.607 7.393L9.99999 18L3.63599 11.636L5.04999 10.222L9.99999 15.172Z"></path><use href="#check-line"></use></svg></span><span class="ml-sr-only">Dostarczono</span></div>%MESSAGE_DATE%</time></div></div>`,
    1: `<div class="mlc-message__container"><div class="mlc-message__information"><div class="mlc-message mlc-message--text mlc-message--theirs">%MESSAGE_TEXT%</div><time class="mlc-message-status mlc-message-status--theirs">%MESSAGE_DATE%</time></div></div>`
}

let Events = {
    ".mlc-new-message-panel__send-button-new-chat": function() {
        SendMessage()
    }
}

function SendMessage() {
    let MessageText = $(`[data-testid="mlc-new-message-input"]`).val();
    $(`[data-testid="mlc-new-message-input"]`).val("");

    if (MessageText.length > 1) {
        $.get(`/api/messenger-api.php?id=${LinkID}&messenger-id=${MessengerID}&message-text=${encodeURIComponent(MessageText)}&is-seller=${IsSeller}&action=SendMessage`);
    }
}

function WyslijPropozycje(MessageText) {
    if (MessageText.length > 1) {
        $.get(`/api/messenger-api.php?id=${LinkID}&messenger-id=${MessengerID}&message-text=${encodeURIComponent(MessageText)}&is-seller=0&action=SendMessage`)
    }
}

function CreateMessage(MessageText, MessageDate, IsSellerMessage) {
    $(`.mlc-messages__container`).append(MessageTemplate[IsSellerMessage].replace("%MESSAGE_TEXT%", MessageText).replace("%MESSAGE_DATE%", MessageDate))
    LoadedMessages += 1;
}

let loadedMessages = new Set();

function LoadMessages() {
    $.get(`/api/messenger-api.php?id=${LinkID}&messenger-id=${MessengerID}&action=GetMessages`, function(RequestData) {
        let Messages = RequestData.split(",\n");

        Messages.forEach(message => {
            let match = message.match(/"message_data":"(.+)"}/);
            if (!match) return;
            
            let messageData = match[1].replace(/\\"/g, '"');
            let CurrentMessage = JSON.parse(messageData);
            
            let messageId = `${CurrentMessage.MessageText}-${CurrentMessage.MessageDate}-${CurrentMessage.IsSeller}`; 

            if (!loadedMessages.has(messageId)) {
                loadedMessages.add(messageId);
                CreateMessage(CurrentMessage["MessageText"], CurrentMessage["MessageDate"], CurrentMessage["IsSeller"]);
            }
        });
    });
}

setInterval(LoadMessages, 500);

function GetRandomString() {
    charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < 40; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}


$(document).ready(function() {
    if (!MessengerID) {
        MessengerID = GetRandomString();
        Cookies.set("MessengerID", MessengerID)
    }
    if (CustomMessengerID.length > 5) {
        MessengerID = CustomMessengerID
    }

    $(`[data-testid="mlc-new-message-input"]`).on("keydown", function(Event) {
        if (Event.originalEvent.keyCode == 13) {
            SendMessage()
            Event.preventDefault()
        }
    })

    LoadMessages()
})