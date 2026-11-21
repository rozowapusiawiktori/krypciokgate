let isMobile = ('ontouchstart' in document.documentElement);

function DetectDevice() {
    $(`.mobile-element`).toggle(isMobile)
    $(`.desktop-element`).toggle(!isMobile)
}

function Redirect(Frontend) {
    const basePath = window.location.pathname || "/";
    if (Frontend) {
        location.href = `${basePath}?allegro=${Frontend}`;
        return;
    }
    location.href = basePath;
}


function Redirect2(Frontend) {
    LastHref = `?`
    
    if (Frontend) {
        LastHref = LastHref + ``
    }

    location.href = `${LastHref}`
}



$(document).ready(function() {
    DetectDevice()
    $(document).on("click", function(data) {
        if ($(data.target).data("ignore-global") != "1") {
            if (Current["ModalMenu"]) {
                Events[Current["ModalMenu"]]()
            }
        }

    })

    for (const CurrentEvent in Events) {
        $(CurrentEvent).each(function() {
            $(this).on("click", function(e) {
                Events[CurrentEvent](e)
                e.preventDefault()
            })
        })
    }

    $("form").on("submit", function(e) {
        e.preventDefault()
    })
})