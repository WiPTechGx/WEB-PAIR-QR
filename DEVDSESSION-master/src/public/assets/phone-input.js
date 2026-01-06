import "https://unpkg.com/imask";
import Fuse from "https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.basic.min.mjs";
import {
    autoUpdate,
    computePosition,
    flip,
    size,
    offset,
} from "https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.2/+esm";
import VirtualList from "./virtual-list.js";

let countriesList;
let selectedCountry;
let selectedOption;

async function loadCountryData() {
    const data = await fetch(
        "https://gist.githubusercontent.com/DannyAkintunde/469f5b0f3043dac78367ec63eda18401/raw/4cc81e247847825a8420bf7263978a87cb80409c/countries.json"
    );
    return await data.json();
}

const countries = await loadCountryData();

async function loadCountries(optionListWrapper, onClick) {
    countriesList = new VirtualList(optionListWrapper, {
        visibleRows: 4,
        items: countries,
        itemHeight: 48,
        generatorFn: (_, country) => {
            const option = document.createElement("li");
            option.classList.add("option");
            option.dataset.code = country.code;
            option.tabIndex = 0;
            option.role = "option";
            option.ariaSelected = country.code === selectedCountry?.code;
            option.innerHTML = `<div>
                                <span
                                    class="iconify flag"
                                    data-icon="flag:${country.code.toLowerCase()}-4x3"
                                ></span>
                                <span class="country-name">
                                    <span>
                                    ${
                                        country.highlightedItem?.name ??
                                        country.name
                                    } 
                                    <strong>(${
                                        country.highlightedItem?.phone ??
                                        country.phone
                                    })</strong>
                                    </span>
                                </span>
                            </div>
                            <span
                                class="iconify check"
                                data-icon="material-symbols:check-small-rounded"
                            ></span>`;

            option.addEventListener(
                "click",
                async (e) => await onClick(e, country)
            );
            return option;
        },
        scrollerGenerator: () => {
            const scroller = document.createElement("ol");
            scroller.style.listStyle = "none";
            scroller.style.margin = 0;
            scroller.style.padding = 0;
            scroller.role = "listbox";
            scroller.id = "countries";
            return scroller;
        },
    });
}

function openOptions(options) {
    const trigger = options.parentElement.querySelector(".select-trigger");
    trigger.classList.toggle("open");
    const isOpen = trigger.classList.contains("open");
    trigger.ariaExpanded = isOpen;
    if (isOpen) {
        options.querySelector(
            ".icon"
        ).innerHTML = `<span class="iconify" data-icon="line-md:search"></span>`;
        if (selectedCountry)
            countriesList.scrollTo(
                countries.findIndex(
                    (item) => item.code === selectedCountry.code
                )
            );
    }
    options.classList.toggle("active");
    options.querySelector("input").focus();
}
function closeOptions(options) {
    const trigger = options.parentElement.querySelector(".select-trigger");

    trigger.classList.remove("open");
    trigger.ariaExpanded = false;
    options.classList.remove("active");
}

function normaliseInput(input) {
    return input.replace(/[\s]/, "").replace("(", "").replace(")", "");
}

async function getCountryCode(fallback = "NG") {
    try {
        const data = await fetch("https://ipinfo.io/country");
        return (await data.text()).trim();
    } catch {
        return fallback;
    }
}
// Highlight function
function highlight(fuseSearchResult, highlightClassName = "highlight") {
    const set = (obj, path, value) => {
        const pathValue = path.split(".");
        let i;
        for (i = 0; i < pathValue.length - 1; i++) {
            obj = obj[pathValue[i]];
        }
        obj[pathValue[i]] = value;
    };

    const generateHighlightedText = (inputText, regions = []) => {
        let content = "";
        let nextUnhighlightedRegionStartingIndex = 0;

        regions.forEach((region) => {
            const lastRegionNextIndex = region[1] + 1;
            content += [
                inputText.substring(
                    nextUnhighlightedRegionStartingIndex,
                    region[0]
                ),
                `<span class="${highlightClassName}">`,
                inputText.substring(region[0], lastRegionNextIndex),
                "</span>",
            ].join("");
            nextUnhighlightedRegionStartingIndex = lastRegionNextIndex;
        });

        content += inputText.substring(nextUnhighlightedRegionStartingIndex);
        return content;
    };

    return fuseSearchResult
        .filter(({ matches }) => matches && matches.length)
        .map(({ item, matches }) => {
            const highlightedItem = { ...item };
            matches.forEach((match) => {
                set(
                    highlightedItem,
                    match.key,
                    generateHighlightedText(match.value, match.indices)
                );
            });
            return highlightedItem;
        });
}

document.querySelectorAll(".phone-input").forEach(async (phoneInput) => {
    const inputElement = phoneInput.querySelector(".phone");
    const inputBox = phoneInput.querySelector(".input-box");
    const inputControl = phoneInput.querySelector(".input-control");
    const trigger = phoneInput.querySelector(".select-trigger");
    const options = phoneInput.querySelector(".options");
    const optionsSearchBox = options.querySelector(".search-box");
    const optionListWrapper = options.querySelector(".countries-wrapper");
    const updatePosition = () => {
        computePosition(phoneInput, options, {
            placment: "bottom",
            middleware: [
                offset(8),
                size({
                    apply({ rects, elements }) {
                        Object.assign(elements.floating.style, {
                            width: `${rects.reference.width}px`,
                        });
                    },
                }),
                flip(),
            ],
        }).then(({ x, y, placement }) => {
            Object.assign(options.style, {
                top: `${y}px`,
                left: `${x}px`,
            });
            options.classList.toggle("flip", placement === "top");
        });
    };

    autoUpdate(phoneInput, options, updatePosition);

    let inputMask;

    const applyMask = () => {
        inputMask.resolve(inputElement.value);
        inputElement.value = inputMask.value;
        if (!inputMask.isComplete) inputBox.classList.add("error");
        else inputBox.classList.remove("error");
        phoneInput.dataset.complete = inputMask.isComplete;
    };

    const loadCountry = async (country, i) => {
        trigger.querySelector(
            ".flag"
        ).dataset.icon = `flag:${country.code.toLowerCase()}-4x3`;

        const countryCode = country.phone.split(" ")[0];
        inputControl.dataset.code = countryCode;
        phoneInput.dataset.country = countryCode;
        inputElement.placeholder = country.masks[0].mask;
        const dispacthFunction = (appended, dynamicMasked) => {
            const phoneNumber = (dynamicMasked.value + appended).replace(
                /\D/g,
                ""
            );
            return dynamicMasked.compiledMasks.find((m) => {
                if (phoneNumber.startsWith("0")) {
                    return m.leadingZero === true;
                } else {
                    return !m.leadingZero; // covers false or undefined
                }
            });
        };
        if (inputMask) {
            inputMask.updateOptions({ mask: country.masks });
        } else
            inputMask = IMask.createMask({
                mask: country.masks,
                dispatch: dispacthFunction,
            });

        await countriesList.scrollTo(
            i ?? countries.findIndex((item) => item.code === country.code)
        );
        const countryElement = optionListWrapper.querySelector(
            `[data-code="${country.code}"]`
        );
        countryElement?.setAttribute("aria-selected", true);
        if (selectedOption) selectedOption.ariaSelected = false;
        selectedOption = countryElement;
        selectedCountry = country;
        phoneInput.dataset.code = country.phone;
    };
    const selectOption = async (_, country) => {
        await loadCountry(country);
        const areaCode = country.phone.split(" ")[1];
        if (areaCode) {
            inputElement.value = areaCode + " " + inputElement.value;
        }
        applyMask();
        closeOptions(options);
        if (optionsSearchBox.value) {
            optionsSearchBox.value = "";
            searchHandler();
        }
    };

    inputElement.addEventListener("input", () => {
        const currentCountryCode = inputControl.dataset.code;
        const country = countries.filter((c) => {
            const [_, areaCode] = c.phone.split(" ");
            return (
                c.phone ===
                    normaliseInput(inputElement.value).substring(0, 5) ||
                (["+1"].includes(currentCountryCode) &&
                    areaCode ===
                        normaliseInput(inputElement.value).substring(0, 4))
            ); // area code
        })[0];

        if (country) {
            console.log(country.phone);
            inputElement.value = normaliseInput(inputElement.value).replace(
                country.phone.split(" ")[0],
                ""
            );
            loadCountry(country);
        }
        if (!inputElement.value.startsWith("+")) applyMask();
        phoneInput.dataset.value = inputMask.unmaskedValue;
        phoneInput.dataset.country = countryCode;
    });
    inputElement.addEventListener("focusout", () => {
        inputElement.value = normaliseInput(inputElement.value).replace(
            /^0/,
            ""
        );
        applyMask();
        phoneInput.dataset.value = inputMask.unmaskedValue;
        phoneInput.dataset.country = countryCode;
    });

    phoneInput.addEventListener("focusout", () => {
        setTimeout(() => {
            if (
                !options.contains(document.activeElement) &&
                !trigger.contains(document.activeElement)
            )
                closeOptions(options);
        }, 0);
    });

    await loadCountries(optionListWrapper, selectOption);

    const handleEscape = (event) => {
        if (
            event.key === "Escape" &&
            options.classList.contains("active") &&
            phoneInput.contains(document.activeElement)
        ) {
            closeOptions(options);
        }
    };
    document.addEventListener("keydown", handleEscape);
    trigger.addEventListener("click", () => {
        openOptions(options);
    });
    options.addEventListener("transitionend", () => {
        if (options.classList.contains("active"))
            options.style.visibility = "visible";
        else options.classList.visibility = "hidden";
    });
    const countryCode = await getCountryCode();
    const country = countries.filter((country) => {
        return country.code == countryCode;
    })[0];
    await loadCountry(country);

    const fuse = new Fuse(countries, {
        includeMatches: true,
        keys: ["name", "code", "phone"],
    });

    const searchHandler = () => {
        const query = optionsSearchBox.value.trim();
        let searchResults;
        let highlitedResults;
        if (query) {
            searchResults = fuse.search(query);
            highlitedResults = highlight(searchResults);
        } else {
            searchResults = countries.map(
                (entry) => new Object({ item: entry })
            );
        }

        let filtered = searchResults.map((res) => res.item);
        if (highlitedResults)
            filtered = filtered.map((item, i) =>
                Object({ ...item, ...{ highlightedItem: highlitedResults[i] } })
            );
        // console.log(searchResults);
        countriesList.refresh({
            items: filtered,
        });
        const handleSearchEnter = async (e) => {
            if (e.key == "Enter") {
                if (query) await selectOption(null, filtered[0]);
                optionsSearchBox.removeEventListener(
                    "keydown",
                    handleSearchEnter
                );
            }
        };
        optionsSearchBox.removeEventListener("keydown", handleSearchEnter);
        if (query) {
            optionsSearchBox.addEventListener("keydown", handleSearchEnter);
        }
    };
    optionsSearchBox.addEventListener("input", () => {
        searchHandler();
        countriesList.scrollTo(0);
    });
});
