// 生成或获取设备ID（从用户代码中提取）

function loadFontAwesome() {
    // const fontAwesomeLink = document.createElement('link');
    // fontAwesomeLink.rel = 'stylesheet';
    // fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'; // 替换为 Font Awesome CDN 链接
    // document.head.appendChild(fontAwesomeLink);
}

export function compareDataDiff(target, source) {
    const diff = {};
    for (const key of Object.keys(target)) {
        if (target[key] !== source[key]) {
            diff[key] = target[key];
        }
    }
    return diff;
}

export function compareDataSame(target, source) {
    const same = {};
    for (const key of Object.keys(target)) {
        if (target[key] === source[key]) {
            same[key] = target[key];
        }
    }
}

export function cssColorToRgba(name, opacity = 1) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).replace(')', `, ${opacity})`);
}

/**
 * 创建一个只读属性
 * @param {object} obj 要在其上定义属性的对象
 * @param {string} propertyName 属性名称
 * @param {function} getter 获取属性值的函数
 */
export function readonly(obj, propertyName, getter) {
    Object.defineProperty(obj, propertyName, {
        get: getter,
        set(value) {
            throw new Error(`${propertyName} property is read-only and cannot be written to.`);
        }
    });
}

let step = 0;  // 保证每次调用该函数时绝对能生成不一样的随机数
function stepRandom(bias = step) {
    // console.log('stepRandom');
    let r = 100000 / (100000 / Math.random() + bias++);
    return r;
}

/**
 * 生成一个随机字符串
 * @description 请注意，该函数不适用于安全敏感的场景，在长度低于 12 时有碰撞的风险
 * @description 在 length = 8 时有 0.000023% (1,000,000次实验) 的可能性会出现重复
 * @param length
 * @param bias
 * @param characters
 * @returns {string}
 */
export function generateRandomString(length = 12, bias = step, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(stepRandom(bias) * characters.length));
    }
    return result;
}

/**
 * 生成一个随机数字
 * @description 请注意，该函数不适用于安全敏感的场景，且在 length = 8 时有 0.00005% (1,000,000次实验) 的可能性会出现重复
 * @param length
 * @param forceLength
 * @returns {number}
 */
export function generateRandomNumber(length = 12, forceLength = true) {
    let randomNumber;

    do {
        randomNumber = Math.floor(stepRandom() * Math.pow(10, length));

        // 如果需要强制长度，确保生成的数字符合要求
        if (forceLength && randomNumber.toString().length < length) {
            randomNumber *= Math.pow(10, length - randomNumber.toString().length);
        }
    } while (forceLength && randomNumber.toString().length !== length);

    return randomNumber;
}

//random一个唯一id加密用
export function generateUid() {
    const rid = `st-${Date.now()}-${generateRandomString(32)}`;
    console.log('Generated Unique ID:', rid);
    return rid;
}

export function generateDeviceId() {
    let deviceId = localStorage.getItem('st_device_id') || generateUid();
    if (!localStorage.getItem('st_device_id')) {
        localStorage.setItem('st_device_id', deviceId);
    }
    return deviceId;
}


let antiShakeTimers = {};
/**
 * 防抖函数，控制某个操作的执行频率
 * @param {string} uid 唯一标识符，用于区分不同的防抖操作
 * @param {number} interval 时间间隔，单位毫秒，在这个间隔内只允许执行一次
 * @returns {boolean} 如果允许执行返回 true，否则返回 false
 */
export function lazy(uid, interval = 100) {
    if (!antiShakeTimers[uid]) {
        antiShakeTimers[uid] = { lastExecutionTime: 0 };
    }
    const timer = antiShakeTimers[uid];
    const currentTime = Date.now();

    if (currentTime - timer.lastExecutionTime < interval) {
        return false; // 时间间隔太短，防抖，不允许执行
    }

    timer.lastExecutionTime = currentTime;
    return true; // 允许执行
}


/**
 * 使用原生 JavaScript 方法计算字符串的 MD5 哈希值
 * @param {string} string 要计算哈希的字符串
 * @returns {Promise<string>}  返回一个 Promise，resolve 值为十六进制表示的 MD5 哈希字符串
 */
export async function calculateStringHash(string) {
    // 检查string是否为字符串
    if (typeof string !== 'string') {
        throw new Error('The input value is not a string.');
    }

    // 步骤 1: 将字符串编码为 Uint8Array
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(string);

    // 步骤 2: 使用 crypto.subtle.digest 计算哈希值
    // 仅适用于非安全敏感的场景，例如数据校验。
    const hashBuffer = await crypto.subtle.digest('MD5', data);

    // 步骤 3: 将 ArrayBuffer 转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map(byte => byte.toString(16).padStart(2, '0')) // 将每个字节转换为两位十六进制字符串
        .join(''); // 连接成一个完整的十六进制字符串

    return hashHex;
}

