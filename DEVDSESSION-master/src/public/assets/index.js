const API = window.location.origin;
// API = "https://127.0.0.1:8000"; // for testing purposes, change to your API URL
const tabber = document.getElementById("tabber");

let activeTab = null;
const slider = document.getElementById(tabber.getAttribute("data-for"));
const tabs = Array.from(tabber.querySelectorAll('[id^="tab-"]'));

function updateIndicator(tabIndex) {
    const padding =
        getComputedStyle(tabber).getPropertyValue("--tabber-padding");
    const tabLength = tabber.children.length;
    const increment = 100 / tabLength;
    let posLeft = `${increment * tabIndex}% - ${padding}`;
    if (tabIndex === 0) posLeft = padding;

    tabber.style.setProperty("--tabber-pos-left", `calc(${posLeft})`);
}

function updateSlider(slider, i) {
    slider.style.transform = `translateX(-${i * 100}%)`;
}

function getTabPlane(tab) {
    const planeId = tab.getAttribute("aria-controls");
    return document.getElementById(planeId);
}

function activateTab(tab) {
    const plane = getTabPlane(tab);
    tab.classList.add("active");
    plane.classList.add("active");
    plane.setAttribute("aria-hidden", false);
    tab.setAttribute("aria-selected", true);
}
function deactivateTab(tab) {
    const plane = getTabPlane(tab);
    tab.classList.remove("active");
    plane.classList.remove("active");
    plane.setAttribute("aria-hidden", true);
    tab.setAttribute("aria-selected", false);
}

function switchTab(tab, i) {
    deactivateTab(activeTab);
    activateTab(tab);
    const tabIndex = i ?? tabs.indexOf(tab);
    updateIndicator(tabIndex);
    updateSlider(slider, tabIndex);
    activeTab = tab;
    const activeTabPlaneId = tab.getAttribute("aria-controls");
    const url = new URL(window.location);
    url.searchParams.set("tab", activeTabPlaneId);
    localStorage.setItem("tab", activeTabPlaneId);
    history.pushState("", null, url);
    tabber.dispatchEvent(new CustomEvent("tab-switch", { detail: tabIndex }));
}

function getActiveTab() {
    let urlTab = new URL(window.location).searchParams.get("tab");
    urlTab = urlTab ?? localStorage.getItem("tab");
    console.log(urlTab);
    return tabs.filter(
        (tab) => tab.getAttribute("aria-controls") === urlTab
    )[0];
}

activeTab = tabs.filter((tab) => tab.classList.contains("active"))[0];

const prevActiveTab = getActiveTab();
if (prevActiveTab) switchTab(prevActiveTab);

tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
        if (tab.classList.contains("active")) return;
        switchTab(tab, i);
    });
});
const sun = `   <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-label="light"
                        >
                            <g clip-path="url(#clip0_44_207)">
                                <path
                                    d="M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M12 1V3"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M12 21V23"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M4.22021 4.22L5.64021 5.64"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M18.3599 18.36L19.7799 19.78"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M1 12H3"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M21 12H23"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M4.22021 19.78L5.64021 18.36"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M18.3599 5.64L19.7799 4.22"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </g>
                            <defs>
                                <clipPath id="clip0_44_207">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="currentColor"
                                    />
                                </clipPath>
                            </defs>
                        </svg>`;
const moon = `<svg width="24" height="24" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="dark">
                    <path d="M3 11.5066C3 16.7497 7.25034 21 12.4934 21C16.2209 21 19.4466 18.8518 21 15.7259C12.4934 15.7259 8.27411 11.5066 8.27411 3C5.14821 4.55344 3 7.77915 3 11.5066Z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
`;

const themeToggle = document.getElementById("theme-toggle");
function updateThemeIcon(theme) {
    if (theme === "dark") return (themeToggle.innerHTML = sun);
    themeToggle.innerHTML = moon;
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    body.classList.remove(currentTheme);
    body.classList.add(newTheme);
    body.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
}

function showElement(element) {
    element.classList.remove("hidden");
    element.setAttribute("aria-hidden", false);
}
function hideElement(element) {
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", true);
}

// pair
const pairTab = document.getElementById("pair");

const copyIcon = `    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M16 12.9V17.1C16 20.6 14.6 22 11.1 22H6.9C3.4 22 2 20.6 2 17.1V12.9C2 9.4 3.4 8 6.9 8H11.1C14.6 8 16 9.4 16 12.9Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M22 6.9V11.1C22 14.6 20.6 16 17.1 16H16V12.9C16 9.4 14.6 8 11.1 8H8V6.9C8 3.4 9.4 2 12.9 2H17.1C20.6 2 22 3.4 22 6.9Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>`;
const copiedIcon = `<svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M22 11.1V6.9C22 3.4 20.6 2 17.1 2H12.9C9.4 2 8 3.4 8 6.9V8H11.1C14.6 8 16 9.4 16 12.9V16H17.1C20.6 16 22 14.6 22 11.1Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M16 17.1V12.9C16 9.4 14.6 8 11.1 8H6.9C3.4 8 2 9.4 2 12.9V17.1C2 20.6 3.4 22 6.9 22H11.1C14.6 22 16 20.6 16 17.1Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M6.08008 14.9998L8.03008 16.9498L11.9201 13.0498"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
`;

const copyContainer = pairTab.querySelector("#copy");
const copyBtn = copyContainer.querySelector(".btn");
copyBtn.querySelector(".icon").innerHTML = copyIcon;

function updateCopyContanier(text) {
    const formattedCode = `${text.substring(0, 4)}-${text.substring(4)}`;
    copyContainer.setAttribute("data-content", formattedCode);
    copyContainer.querySelector("#code").textContent = formattedCode;
}

function showCopyContanier() {
    showElement(copyContainer);
    pairBtn.classList.remove("expanded");
}

function copyToClipboard(text) {
    navigator.clipboard
        .writeText(text)
        .then(() => {
            console.log("Copied to clipboard:", text);
            copyBtn.querySelector(".icon").innerHTML = copiedIcon;
            copyBtn.classList.add("copied");
            copyContainer.querySelector("#code").textContent = "Copied!";
            setTimeout(() => {
                copyBtn.querySelector(".icon").innerHTML = copyIcon;
                copyContainer.querySelector("#code").textContent = text;
                copyBtn.classList.remove("copied");
                copyBtn.blur();
            }, 2000);
        })
        .catch((err) => {
            console.error("Failed to copy text:", err);
        });
}

const holdDuration = 30;

const clockIcon = `<svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm.75 12H12a.75.75 0 0 1-.75-.75V6.5a.75.75 0 0 1 1.5 0v5.25h2.25a.75.75 0 0 1 0 1.5Z"
                        fill="currentColor"
                    />
                </svg>`;
const refreshIcon = `      <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <g clip-path="url(#clip0_24_91)">
                                <path
                                    d="M22.6067 12.7489C23.4269 12.8655 23.9972 13.625 23.8806 14.4452C23.5239 16.9531 22.3827 19.2839 20.6205 21.1037C18.8582 22.9234 16.5652 24.1388 14.07 24.5758C11.5747 25.0127 9.00523 24.6488 6.72947 23.5361C5.66003 23.0134 4.68123 22.3378 3.8208 21.5362L2.56067 22.7963C1.61571 23.7413 0 23.072 0 21.7357V15.7556H5.98009C7.31645 15.7556 7.9857 17.3713 7.04074 18.3163L5.9439 19.4131C6.57009 19.9828 7.27729 20.4647 8.04712 20.8411C9.75396 21.6755 11.6811 21.9484 13.5525 21.6208C15.4239 21.293 17.1437 20.3815 18.4653 19.0166C19.7871 17.6518 20.643 15.9038 20.9104 14.0228C21.0271 13.2026 21.7866 12.6323 22.6067 12.7489ZM17.2705 1.97508C18.3419 2.49884 19.3221 3.17585 20.1837 3.97919L21.4394 2.72351C22.3843 1.77856 24 2.44781 24 3.78418V9.75563H18.0285C16.6922 9.75563 16.0229 8.13992 16.9678 7.19498L18.0606 6.10223C17.4333 5.53081 16.7246 5.04749 15.9529 4.67021C14.246 3.83575 12.3189 3.56281 10.4475 3.89053C8.57606 4.21823 6.85633 5.12978 5.53464 6.4946C4.21293 7.85941 3.35703 9.60749 3.08953 11.4885C2.97289 12.3086 2.21346 12.879 1.39329 12.7623C0.573112 12.6457 0.00278378 11.8863 0.119422 11.0661C0.476085 8.55811 1.61727 6.22735 3.37955 4.40759C5.14182 2.58784 7.43478 1.37244 9.93001 0.93549C12.4253 0.49854 14.9948 0.862442 17.2705 1.97508Z"
                                    fill="currentColor"
                                />
                            </g>
                            <defs>
                                <clipPath id="clip0_24_91">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="currentColor"
                                        transform="translate(0 0.755615)"
                                    />
                                </clipPath>
                            </defs>
                        </svg>`;

const inputContainer = document.querySelector(".input-container");
const phoneInput = inputContainer.querySelector(".phone-input");
const errorMsg = inputContainer.querySelector(".error");

function validatePhoneNumber() {
    console.log(phoneInput.dataset.complete);
    if (phoneInput.dataset.complete !== "true") {
        if (!phoneInput.dataset.value)
            errorMsg.textContent = "phone number is required";
        else errorMsg.textContent = "invalid phone number";
        errorMsg.classList.add("show");
        return;
    }
    errorMsg.classList.remove("show");
    const phoneNumber =
        phoneInput.dataset.code.replace("+", "") + phoneInput.dataset.value;
    console.log(phoneNumber);
    return phoneNumber;
}

const pairBtn = pairTab.querySelector("#get-code");
const pairBtnText = pairBtn.querySelector(".text");
const pairBtnDelayElement = pairBtn.querySelector(".delay");
const pairLoader = pairBtn.querySelector(".loader");

let pairInterval = null;

function startPairCooldown() {
    if (pairInterval) return; // Prevent multiple intervals
    let timeLeft = holdDuration;
    pairBtnDelayElement.innerHTML = clockIcon + `<span>${timeLeft}s</span>`;

    // Update button text and icon
    pairBtn.setAttribute("disabled", true);
    hideElement(pairBtnText);
    showElement(pairBtnDelayElement);

    pairInterval = setInterval(() => {
        pairBtnDelayElement.innerHTML = clockIcon + `<span>${timeLeft}s</span>`;
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(pairInterval);
            pairInterval = null;
            pairBtn.removeAttribute("disabled");
            hideElement(pairBtnDelayElement);
            showElement(pairBtnText);
        }
    }, 1000);
}

function getPairingCode(phone) {
    showElement(pairLoader);
    return fetch(new URL("api/pair", API).toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            phoneNumber: phone,
        }),
    }).then((data) => {
        if (!data.ok) {
            console.error("Failed to fetch pairing code");
            errorMsg.textContent = "Oops an error occured";
            errorMsg.classList.add("show");
            showElement(pairBtnText);
            hideElement(pairLoader);
            return;
        }
        errorMsg.classList.remove("show");
        data.json().then((data) => {
            console.log(data);
            const pairingCode = data.code;
            updateCopyContanier(pairingCode);
            showCopyContanier();
            hideElement(pairLoader);
        });
    });
}

// qr
const qrTab = document.getElementById("qr");
const qrBtn = qrTab.querySelector("#regenerate");
const left = qrBtn.querySelector(".left");
const leftText = left.querySelector(".text");
const icon = left.querySelector(".icon");
const right = qrBtn.querySelector(".right");
icon.innerHTML = refreshIcon;

let qrInterval;

function startQRCooldown() {
    if (qrInterval) return; // Prevent multiple intervals
    let timeLeft = holdDuration;

    // Update button text and icon
    qrBtn.setAttribute("disabled", true);
    qrBtn.classList.add("cooldown");
    left.classList.add("shifted");
    leftText.textContent = "Hold on";
    right.classList.remove("hidden");
    icon.innerHTML = clockIcon;

    qrInterval = setInterval(() => {
        right.textContent = `${timeLeft}s`;
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(qrInterval);
            qrInterval = null;
            qrBtn.removeAttribute("disabled");
            qrBtn.classList.remove("cooldown");
            left.classList.remove("shifted");
            leftText.textContent = "Regenerate";
            right.classList.add("hidden");
            icon.innerHTML = refreshIcon;
        }
    }, 1000);
}

const qrCodeElement = document.getElementById("qr-code");
const qrCodeLoader = qrCodeElement.querySelector(".loader");
const qrBtnLoader = qrBtn.querySelector(".loader");
const qrCodeError = qrCodeElement.querySelector(".error");
const qrNoNetwork = `                                    
<svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    stroke-width="1.5"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
>
    <path
        d="M12 18.51L12.01 18.4989"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
    />
    <path
        d="M2 7C8 2.5 16 2.5 22 7"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
    />
    <path
        d="M5 11C9 8 15 8 19 11"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
    />
    <path
        d="M8.5 14.5C10.7504 13.1 13.2498 13.0996 15.5001 14.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
    />
    <path
        d="M17.1213 21.364L19.2426 19.2427M21.364 17.1214L19.2426 19.2427M19.2426 19.2427L17.1213 17.1214M19.2426 19.2427L21.364 21.364"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
    />
</svg>
<p>No internet conenection</p>`;
const qrErrorOccured = `
<svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
>
    <path
        d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12zm5.793-4.207a1 1 0 0 1 1.414 0L12 10.586l2.793-2.793a1 1 0 1 1 1.414 1.414L13.414 12l2.793 2.793a1 1 0 0 1-1.414 1.414L12 13.414l-2.793 2.793a1 1 0 0 1-1.414-1.414L10.586 12 7.793 9.207a1 1 0 0 1 0-1.414z"
        fill="currentColor"
    />
</svg>
<p>Unable to generate QR</p>`;

let qrCodeGenerator = null;
function generateQrCode(data) {
    if (!qrCodeGenerator)
        qrCodeGenerator = new QRCode(qrCodeElement, {
            text: data,
            colorDark: "#000",
            colorLight: "#fff",
            correctLevel: QRCode.CorrectLevel.L,
        });
    else qrCodeGenerator.makeCode(data);
}

function getQr() {
    showElement(qrCodeLoader);
    return fetch(new URL("api/qr", API).toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((data) => {
            if (!data.ok) {
                console.error("Failed to fetch QR code");
                if (navigator.onLine) {
                    qrCodeError.innerHTML = qrErrorOccured;
                    if (data.status >= 500) {
                        qrCodeError.querySelector("p").textContent =
                            "Server Error";
                    }
                }
                showElement(qrCodeError);
                return;
            }
            data.json().then((data) => {
                console.log(data);
                const qrData = data.qr;
                hideElement(qrCodeError);
                generateQrCode(qrData);
                hideElement(qrCodeLoader);
            });
        })
        .catch(() => {
            qrCodeError.innerHTML = qrErrorOccured;
            showElement(qrCodeError);
        });
}

copyBtn.addEventListener("click", () => {
    const content = copyContainer.getAttribute("data-content");
    copyToClipboard(content);
});

pairBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const phoneNumber = validatePhoneNumber();
    if (!phoneNumber) return;
    pairBtn.setAttribute("disabled", true);
    showElement(pairLoader);
    getPairingCode(phoneNumber).finally(() => {
        hideElement(pairLoader);
        startPairCooldown();
    });
});
qrBtn.addEventListener("click", () => {
    qrBtn.setAttribute("disabled", true);
    showElement(qrBtnLoader);
    if (navigator.onLine) hideElement(qrCodeError);
    getQr().finally(() => {
        hideElement(qrBtnLoader);
        startQRCooldown();
    });
});

window.addEventListener("online", () => {
    hideElement(qrCodeError);
    if (qrTab.classList.contains("active")) getQr();
});
window.addEventListener("offline", () => {
    qrCodeError.innerHTML = qrNoNetwork;
    showElement(qrCodeError);
});

// Initialize theme based on saved preference or default to light
document.addEventListener("DOMContentLoaded", () => {
    import("./phone-input.js");
    const savedTheme =
        localStorage.getItem("theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light");
    document.body.setAttribute("data-theme", savedTheme);
    document.body.classList.add(savedTheme);
    updateThemeIcon(savedTheme);
    console.log(savedTheme);
    themeToggle.addEventListener("click", toggleTheme);
    const getQrCodeIfTabActive = () => {
        if (qrTab.classList.contains("active")) getQr();
    };
    getQrCodeIfTabActive();
    setInterval(() => getQrCodeIfTabActive, 60000); // refresh qr code every minute and half
    tabber.addEventListener("tab-switch", (e) => {
        if (e.detail === 1) getQr();
    });
    if (navigator.onLine) {
        hideElement(qrCodeError);
        if (qrTab.classList.contains("active")) getQr();
    } else {
        qrCodeError.innerHTML = qrNoNetwork;
        showElement(qrCodeError);
    }
});

window.addEventListener("load", () => {
    const pageLoader = document.querySelector("body > .loader");
    hideElement(pageLoader);
    pageLoader.addEventListener(
        "transitionend",
        () => (pageLoader.style.display = "none")
    );
});
