/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}} begin
 * @param {{x: number, y: number}} end
 */
function drawLine(ctx, begin, end) {
    ctx.beginPath();
    ctx.moveTo(begin.x, begin.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff0000';
    ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{location: {
 *   topLeftCorner: {x: number, y: number},
 *   topRightCorner: {x: number, y: number},
 *   topRightCorner: {x: number, y: number},
 *   bottomRightCorner: {x: number, y: number},
 *   bottomRightCorner: {x: number, y: number},
 *   bottomLeftCorner: {x: number, y: number},
 *   bottomLeftCorner: {x: number, y: number},
 *   topLeftCorner: {x: number, y: number},
 * }}} code
 */
function drawQrcodeRegion(ctx, code) {
    drawLine(ctx, code.location.topLeftCorner, code.location.topRightCorner);
    drawLine(ctx, code.location.topRightCorner, code.location.bottomRightCorner);
    drawLine(ctx, code.location.bottomRightCorner, code.location.bottomLeftCorner);
    drawLine(ctx, code.location.bottomLeftCorner, code.location.topLeftCorner);
}

/**
 * @param {ArrayBuffer} qrcodeBuffer
 * @returns {{
 * blockIndex: number,
 * blockOffset: number,
 * blockData: Uint8ClampedArray,
 * fileName?: string,
 * fileLength?: number,
 * blockSize?: number,
 * lastBlockIndex?: number,
 * }}
 */
function parseQRcodeBuffer(qrcodeBuffer) {
    const view = new DataView(qrcodeBuffer);
    const blockIndex = view.getUint32(0, true);
    const blockOffset = view.getUint32(4, true);
    const blockData = new Uint8ClampedArray(qrcodeBuffer, 8, qrcodeBuffer.byteLength - 8);
    if (blockIndex === 0) {
        const fileInfo = JSON.parse(Array.from(blockData).map(c => String.fromCodePoint(c)).join(''));
        return {
            blockIndex,
            blockOffset,
            blockData,
            fileName: fileInfo.fileName,
            fileLength: fileInfo.fileLength,
            blockSize: fileInfo.blockSize,
            lastBlockIndex: fileInfo.lastBlockIndex,
        };
    }
    return {
        blockIndex,
        blockOffset,
        blockData,
    };
}

const video = document.createElement('video');
const progressBarCanvas = document.querySelector('#progress-bar');
const canvas = document.querySelector('#canvas');
document.body.append(canvas);
const progressBarCtx = progressBarCanvas.getContext('2d');
progressBarCtx.fillStyle = '#ccc';
progressBarCtx.fillRect(0, 0, progressBarCanvas.width, progressBarCanvas.height);
const ctx = canvas.getContext('2d', {willReadFrequently: true});
navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: 'environment',
        width: 1920,
        height: 1080,
    }
}).then((stream) => {
    video.srcObject = stream;
    video.setAttribute('playsinline', true); // required to tell iOS safari we don't want fullscreen
    video.play();
    let fileName = 'file';
    let fileData = null;
    let blockCount = null;
    let remainingBlockIndexSet = null;

    const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const t0 = Date.now();
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });
            const t1 = Date.now();
            if (code) {
                drawQrcodeRegion(ctx, code);
                if (code.binaryData.length > 8) {
                    const result = parseQRcodeBuffer(new Uint8ClampedArray(code.binaryData).buffer);
                    if (result.blockIndex === 0) {
                        if (result.fileName !== fileName || result.fileLength !== fileData.byteLength) {
                            fileName = result.fileName;
                            fileData = new Uint8ClampedArray(result.fileLength);
                            blockCount = result.lastBlockIndex;
                            remainingBlockIndexSet = new Set();
                            for (let i = 1; i <= result.lastBlockIndex; i++) {
                                remainingBlockIndexSet.add(i);
                            }
                            document.querySelector('#file-name').textContent = `${result.fileName}`;
                            document.querySelector('#file-length').textContent = `${result.fileLength}`;
                            document.querySelector('#speed').textContent = `${t1 - t0}`;
                            document.querySelector('#finished-block-count').textContent = `1`;
                            document.querySelector('#all-block-count').textContent = `${blockCount}`;
                            progressBarCanvas.width = result.lastBlockIndex + 1;
                            progressBarCtx.fillStyle = '#ccc';
                            progressBarCtx.fillRect(0, 0, progressBarCanvas.width, progressBarCanvas.height);
                            progressBarCtx.fillStyle = '#390';
                            progressBarCtx.fillRect(result.blockIndex, 0, 1, 1);
                        }
                    } else {
                        if (fileData) {
                            (new Uint8ClampedArray(fileData.buffer, result.blockOffset, result.blockData.length)).set(result.blockData);
                            remainingBlockIndexSet.delete(result.blockIndex);
                            document.querySelector('#finished-block-count').textContent = `${blockCount - remainingBlockIndexSet.size}`;
                            progressBarCtx.fillStyle = '#390';
                            progressBarCtx.fillRect(result.blockIndex, 0, 1, 1);
                        }
                    }
                    console.log(fileName, result.blockIndex, remainingBlockIndexSet);

                }
            }
        }
        requestAnimationFrame(tick);
    }
    tick();

    document.querySelector('#reset-button').addEventListener('click', () => {
        fileName = 'file';
        fileData = null;
        blockCount = null;
        remainingBlockIndexSet = null;
    });
    document.querySelector('#download-button').addEventListener('click', () => {
        if (fileData) {
            const blob = new Blob([fileData], {type: 'application/octet-stream'});
            saveAs(blob, fileName);
        }
    });
});
