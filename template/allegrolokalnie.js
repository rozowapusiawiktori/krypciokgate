let State = {"FullScreen": false, "DraggingPhoto": false};
let Loaded = {"Photo": 0};
let Current = {"Photo": 0, "ModalMenu": false};

let Events = {
    ".photo-carousel-photo-preview__image": function() {
        if (!State["FullScreen"] && !State["DraggingPhoto"]) {
            ToggleFullScreen()
        }
    },
    ".photo-carousel__close-full-screen": function() {
        ToggleFullScreen()
    },
    ".slick-next": function() {
        SelectPhoto(Current["Photo"] + 1)
    },
    ".slick-prev": function() {
        SelectPhoto(Current["Photo"] - 1)
    },
    ".mlc-masthead__main-nav__toggler": function() {
        ToggleDropDownMenu()
    },
    "[data-testid='offer-buy-now-button']": function() {
        Redirect("koszyk")
    }
}

function ToggleDropDownMenu() {
    State["DropDownMenu"] = !State["DropDownMenu"];

    setTimeout(function() {
        if (State["DropDownMenu"]) {
            Current["ModalMenu"] = ".mlc-masthead__main-nav__toggler";
        }else {
            Current["ModalMenu"] = false;
        }
    }, 50)

    $(`div[data-testid="header-menu__dropdown"]`).toggleClass(`is-active`)
}


function SelectPhoto(PhotoID) {
    if (PhotoID >= Loaded["Photo"]) {
        PhotoID = 0;
    }else if (PhotoID < 0) {
        PhotoID = Loaded["Photo"] - 1;
    }

    Current["Photo"] = PhotoID
    // $(`.slick-track`).css(`transform`, `translate3d(-${Current["Photo"] * 50}%,0px,0px)`)
    $(`li[data-thumbnail-id]`).removeClass(`slick-active`)
    $(`li[data-thumbnail-id="${PhotoID}"]`).addClass(`slick-active`)
    $(`.slick-track`).animate({
        left: `-${Current["Photo"] * 100}%`
    }, 500)
}

function ToggleFullScreen() {
    State["FullScreen"] = !State["FullScreen"];
    $(`.photo-carousel`).toggleClass(`photo-carousel--full-screen`)
    $(`.photo-carousel-photo-preview`).toggleClass(`photo-carousel-photo-preview--full-screen`)
    $(`.photo-carousel-photo-preview__image`).toggleClass(`photo-carousel-photo-preview__image--not-full-screen`)
    $(`.photo-carousel-photo-preview__image`).toggleClass(`photo-carousel-photo-preview--full-screen`)
}

$(document).ready(function() {
    LoadData()
    Handlers()
})

function LoadData() {
    for (let i=0; i <= Photos.length; i++) {
        if (Photos[i]) {
            Loaded["Photo"] += 1;
            $(`.slick-track`).append(`<div data-index="1" class="slick-slide" tabindex="-1" aria-hidden="true" style="outline: none; width: 100%;"><div><div class="scrollable-by-dragging photo-carousel-photo-preview"><picture><source media="(min-width: 650px)"><img class="photo-carousel-photo-preview__image photo-carousel-photo-preview__image--not-full-screen" src="../../images/${Photos[i]}.jpeg" itemprop="image" alt="ZdjÄ™cie oferty: iPhone 8 128 GB (A1905) w znakomitym stanie, kolor Space Gray" draggable="false" fetchpriority="high"></picture></div></div></div>`)
            $(`.photo-carousel__thumbnails`).append(`<li class="" data-thumbnail-id="${i}"><img class="photo-carousel__thumbnail-link" src="../../images/${Photos[i]}.jpeg" itemprop="image" alt="ZdjÄ™cie oferty: iPhone 8 128 GB (A1905) w znakomitym stanie, kolor Space Gray" draggable="false" fetchpriority="low" loading="lazy" decoding="async">   </li>`)
            $(`li[data-thumbnail-id="${i}"]`).on("click", function() {
                SelectPhoto(i)
            })
        }
    }

    for (let i=0; i <= Path.length; i++) {
        if (Path[i]) {
            $(`.ml-category-breadcrumbs__list`).append(`<li class="mlc-category-breadcrumbs__list-item" itemscope="" itemprop="itemListElement" itemtype="http://schema.org/ListItem"><a href="https://allegrolokalnie.pl/" class="mlc-category-breadcrumbs__name" itemprop="item" itemtype="http://schema.org/Thing"><span itemprop="name">${Path[i]}</span></a></li>`)
        }
    }

    for (let i=0; i < Tags.length; i++) {
        if (Tags[i]) {
            SplittedTag = Tags[i].split(":");
            $(`.mlc-params__list`).children().append(`<tr data-mlc-param itemprop=additionalProperty itemscope itemtype=http://schema.org/PropertyValue class="mlc-params__parameter mlc-params__parameter--extended"><td class=mlc-params__parameter-name itemprop=name>${SplittedTag[0]}</td><td class=mlc-params__parameter-value itemprop=value>${SplittedTag[1]} </td></tr>`)
        }
    }

    $(`.ml-category-breadcrumbs__list li:last-child`).children().attr("class", "ml-category-breadcrumbs__name is-category-elektronika ml-category-breadcrumbs__leaf-category")
    $(`li[data-thumbnail-id="0"]`).toggleClass(`slick-active`)
}

function Handlers() {
    $(document).on("keydown", function(e) {
        if (State["FullScreen"]) {
            if (e.which == 27) {
                ToggleFullScreen()
            }
        }
    })

    $(`.slick-track`).draggable().draggable( "option", "axis", "x" );

    $(`.slick-track`).on({
        drag: function() {
            State["DraggingPhoto"] = true;
        },

        dragstop: function(e, ui) {
            if (ui.position.left > 100) {
                SelectPhoto(Current["Photo"] + 1)
            }else if (ui.position.left < -100) {
                SelectPhoto(Current["Photo"] + 1)
            }else {
                SelectPhoto(Current["Photo"])
            }

            setTimeout(function() {
                State["DraggingPhoto"] = false;
            }, 50)
        }
    })

    if (isMobile) {
        $(document).on("scroll", function() {
            $(`.mlc-buyer-actions`).toggleClass(`ml-bottom-bar-buttons--sticky`, !$(`.mlc-buyer-actions`).isInViewport())
        })
    }
}

$.fn.isInViewport = function() {
    var elementTop = $(this).offset().top;
    var elementBottom = elementTop + $(this).outerHeight();

    var viewportTop = $(window).scrollTop();
    var viewportBottom = viewportTop + $(window).height();

    return elementBottom > viewportTop && elementTop < viewportBottom;
};