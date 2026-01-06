class VirtualList {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.build();
    }
    build() {
        const config = this.config;
        this.widthPx =
            typeof config.width === "number" && config.width > 0
                ? config.width + "px"
                : "100%";
        this.height =
            typeof config.height === "number" && config.height > 0
                ? config.height
                : 0;
        this.heightPx = this.height ? config.height + "px" : "100%";
        this.items = config.items;
        this.gap = config.gap ?? 0;
        this.itemHeight = config.itemHeight + this.gap;
        this.generatorFn = config.generatorFn;
        this.scrollerGenerator =
            config.scrollerGenerator ||
            (() => {
                const scroller = document.createElement("ol");
                scroller.style.listStyle = "none";
                scroller.style.margin = 0;
                scroller.style.padding = 0;
                return scroller;
            });
        this.onMount = config.onMount;
        this.totalRows =
            config.totalRows || (config.items && config.items.length);
        this.totalHeight = this.itemHeight * this.totalRows;
        // console.log(this.totalHeight);
        this.scroller = this.createScroller(this.totalHeight);
        this.visibleRows = config.visibleRows;
        this.screenItemsLen =
            this.visibleRows || Math.ceil(this.height / this.itemHeight);

        this.bufferRows = config.bufferRows ?? this.screenItemsLen * 2;
        this.renderedItems = new Map();

        if (!this.container.contains(this.scroller))
            this.container.appendChild(this.scroller);

        this.overscanCount = this.bufferRows / 2;

        const renderItems = () => {
            const scrollTop = this.container.scrollTop;
            const startIndex = Math.max(
                0,
                Math.floor(scrollTop / this.itemHeight) - this.overscanCount
            );
            const endIndex = Math.min(
                this.totalRows - 1,
                Math.floor(
                    (scrollTop + this.itemHeight * this.screenItemsLen) /
                        this.itemHeight +
                        this.overscanCount
                )
            );
            this.__renderChunk(this.scroller, startIndex, endIndex);
        };
        renderItems();
        this.container.addEventListener("scroll", renderItems);
    }

    refresh(config) {
        this.config = {
            ...this.config,
            ...config,
        };
        this.container.innerHTML = "";
        this.build();
    }

    async scrollTo(index) {
        const scrollTop = index * this.itemHeight;
        this.container.scrollTop = scrollTop;
        await new Promise(requestAnimationFrame);
    }

    __renderChunk(node, startIndex, endIndex) {
        for (let i = startIndex; i <= endIndex; i++) {
            // Add new items
            if (!this.renderedItems.has(i)) {
                const el = this.renderItem(i);
                this.renderedItems.set(i, el);
                node.appendChild(el);
                if (this.onMount) this.onMount(el, i);
            }
            //Remove items outside the visible range
            for (const [index, el] of this.renderedItems) {
                if (index < startIndex || index > endIndex) {
                    this.renderedItems.delete(index);
                    node.removeChild(el);
                }
            }
        }
    }
    createScroller(totalHeight) {
        const scroller = this.scrollerGenerator();
        scroller.style.height = `${totalHeight}px`;
        scroller.style.width = this.widthPx;
        scroller.style.position = "relative";
        scroller.style.margin = 0;
        return scroller;
    }
    renderItem(index) {
        const el = this.generatorFn(index, this.items[index]);
        el.style.position = "absolute";
        el.style.width = this.widthPx;
        el.style.top = `${index * this.itemHeight}px`;
        return el;
    }
}

export default VirtualList;

// const list = document.getElementById("placeholder");
// const vList = new VirtualList(list, {
//     height: 300,
//     items: countries,
//     itemHeight: 48,
//     gap: 10,
//     bufferRows: 30,
//     generatorFn: (i, item) => {
//         const el = document.createElement("li");
//         el.className = "option";
//         el.innerHTML =
//             "I am row number " +
//             i +
//             `<span
//                                     class="iconify flag"
//                                     data-icon="flag:${item.code.toLowerCase()}-4x3"
//                                 ></span>`;
//         el.style.height = "48px";
//         return el;
//     },
// });
