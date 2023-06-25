/**
 * @param {HTMLDivElement} el
 * @param {number} progress
 * @param {string} frontColor
 * @param {string} backgroundColor
 */
function progressBarSetProgress(el, progress, frontColor, backgroundColor) {
    el.style.background = `linear-gradient(to right, ${frontColor} 0%, ${frontColor} ${progress * 100}%, ${backgroundColor} ${progress * 100}%, ${backgroundColor} 100%)`;
}

/**
 * @param {HTMLElement} el
 * @param {function (progress: number): void} callback
 */
function progressBarAddProgressListener(el, callback) {
    let isDown = false;
    const wrappedCallback = (eventType) => (e) => {
        if (eventType === 'pointerdown') {
            isDown = true;
            e.target.setPointerCapture(e.pointerId);
        } else if (eventType === 'pointerup' || eventType === 'pointercancel') {
            isDown = false;
        }
        if (isDown) {
            callback(Math.min(Math.max(e.clientX / el.clientWidth, 0), 1));
        }
    }
    el.addEventListener('pointerdown', wrappedCallback('pointerdown'));
    el.addEventListener('pointermove', wrappedCallback('pointermove'));
    el.addEventListener('pointerup', wrappedCallback('pointerup'));
    el.addEventListener('pointercancel', wrappedCallback('pointercancel'));
}

/**
 * @param {number[] | Uint8Array | Uint8ClampedArray} uint8Array
 * @param {'L' | 'M' | 'Q' | 'H'} errorCorrectionLevel
 * @returns {string}
 */
function createQrcodeDataUrl(uint8Array, errorCorrectionLevel) {
    qrcode.stringToBytesFuncs['buffer'] = (s) => s;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['buffer'];
    const qr = qrcode(0, errorCorrectionLevel);
    qr.addData(uint8Array);
    qr.make();
    return qr.createDataURL();
}

/**
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        reader.readAsArrayBuffer(file);
    });
}

/**
 * @param {number} blockIndex
 * @param {number} blockOffset
 * @param {Uint8ClampedArray} blockData
 * @returns {Uint8ClampedArray}
 */
function addBlockIndexHeader(blockIndex, blockOffset, blockData) {
    const buffer = new ArrayBuffer(8 + blockData.byteLength);
    const view = new DataView(buffer);
    view.setUint32(0, blockIndex, true);
    view.setUint32(4, blockOffset, true);
    new Uint8ClampedArray(buffer, 8, blockData.byteLength).set(blockData);
    return new Uint8ClampedArray(buffer);
}

const JSON_stringify = (o) => JSON.stringify(o).replace(/[\u007F-\uFFFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * @param {string} fileName
 * @param {number} fileLength
 * @param {number} blockSize
 * @param {number} lastBlockIndex
 * @returns {Uint8ClampedArray}
 */
function buildFileInfo(fileName, fileLength, blockSize, lastBlockIndex) {
    const s = JSON_stringify({
        fileName,
        fileLength,
        blockSize,
        lastBlockIndex,
    })
    const uint8Array = new Uint8ClampedArray(blockSize);
    for (let i = 0; i < s.length; i++) {
        uint8Array[i] = s.codePointAt(i);
    }
    for (let i = s.length; i < blockSize; i++) {
        uint8Array[i] = ' '.codePointAt(0);
    }
    return uint8Array;
}

progressBarSetProgress(document.querySelector('#progress-bar'), 0.1, '#390', '#ccc');
document.querySelector('#file-selector').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const fileName = file.name;
    readFile(file)
        .then((fileData) => {
            const fileLength = fileData.byteLength;
            const blockSize = 850;
            const blockCount = Math.ceil(fileData.byteLength / blockSize);
            const lastBlockIndex = blockCount;
            let prevBlockIndex;
            document.querySelector('#all-block-count').textContent = `${blockCount}`;

            const fileDataToQrcodeBuffer = (blockIndex) => {
                if (blockIndex === 0) {
                    return addBlockIndexHeader(0, 0, buildFileInfo(fileName, fileLength, blockSize, lastBlockIndex))
                } else {
                    const blockOffset = (blockIndex - 1) * blockSize;
                    return addBlockIndexHeader(blockIndex, blockOffset, new Uint8ClampedArray(fileData, blockOffset, Math.min(blockSize, fileLength - blockOffset)))
                }
            }

            const setProgress = (blockIndex) => {
                if (blockIndex === prevBlockIndex) {
                    return;
                }
                progressBarSetProgress(document.querySelector('#progress-bar'), blockIndex / blockCount, '#390', '#ccc');
                document.querySelector('#current-block-index').value = `${blockIndex}`;
                document.querySelector('#qrcode').src = createQrcodeDataUrl(fileDataToQrcodeBuffer(blockIndex), 'L');
                prevBlockIndex = blockIndex;
            };

            setProgress(0);
            progressBarAddProgressListener(document.querySelector('#progress-bar'), (progress) => {
                const blockIndex = Math.floor(progress * lastBlockIndex);
                if (blockIndex <= lastBlockIndex) {
                    setProgress(blockIndex);
                }
            });
            document.querySelector('#current-block-index').addEventListener('change', (e) => {
                const blockIndex = parseInt(e.target.value);
                if (!isNaN(blockIndex)) {
                    if (blockIndex <= lastBlockIndex) {
                        setProgress(blockIndex);
                    }
                }
            });
            let isRun = false;
            document.querySelector('#start-button').addEventListener('click', (e) => {
                if (isRun) {
                    isRun = false;
                    document.querySelector('#start-button').value = 'Start';
                    return;
                }
                isRun = true;
                document.querySelector('#start-button').value = 'Stop';

                const onTimer = () => {
                    const blockIndex = prevBlockIndex + 1;
                    if (blockIndex <= lastBlockIndex) {
                        setProgress(blockIndex);
                        if (isRun) {
                            const interval = parseInt(document.querySelector('#speed').value);
                            if (!isNaN(interval)) {
                                setTimeout(onTimer, interval);
                            }
                        }
                    }
                };
                onTimer();
            });
        });
});
