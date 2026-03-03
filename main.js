const fs = require("fs");
const { start } = require("repl");

function convertToSeconds(timeStr) {
    const parts = timeStr.trim().split(' ');
    let [h, m, s] = parts[0].split(':').map(Number);
    const period = parts[1];
    if (period) {
        if (period.toLowerCase() === 'pm' && h !== 12) h += 12;
        else if (period.toLowerCase() === 'am' && h === 12) h = 0;
    }
    return h * 3600 + m * 60 + s;
}

function convertToHMS(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSeconds = convertToSeconds(startTime);
    const endSeconds = convertToSeconds(endTime);
    let shiftDuration = 0;

    shiftDuration = endSeconds - startSeconds;

    return convertToHMS(shiftDuration);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const DELIVERY_START = 8 * 3600;
    const DELIVERY_END   = 22 * 3600;

    const start = convertToSeconds(startTime);
    const end   = convertToSeconds(endTime);

    let idle = 0;
    if (start < DELIVERY_START) idle += Math.min(DELIVERY_START, end) - start;
    if (end > DELIVERY_END)     idle += end - Math.max(DELIVERY_END, start);

    return convertToHMS(idle);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = convertToSeconds(shiftDuration);
    const idleSec  = convertToSeconds(idleTime);

    return convertToHMS(Math.max(0, shiftSec - idleSec));
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const [year, month, day] = date.split('-').map(Number);

    const isEid = (year === 2025 && month === 4 && day >= 10 && day <= 30);
    const quotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;

    return convertToSeconds(activeTime) >= quotaSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let driverID = shiftObj.driverID;
    let driverName = shiftObj.driverName;
    let date = shiftObj.date;
    let startTime = shiftObj.startTime;
    let endTime = shiftObj.endTime;

    let content = fs.readFileSync(textFile, { encoding: 'utf8' });
    let lines = content.split('\n');

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        let cols = lines[i].split(',');
        if (cols[0] === driverID && cols[2] === date) return {};
    }

    let startSec = convertToSeconds(startTime);
    let endSec = convertToSeconds(endTime);
    let shiftDuration = convertToHMS(endSec - startSec);

    let deliveryStart = 8 * 3600;
    let deliveryEnd = 22 * 3600;
    let idleSec = 0;

    if (startSec < deliveryStart) {
        if (endSec <= deliveryStart) {
            idleSec += endSec - startSec;
        } else {
            idleSec += deliveryStart - startSec;
        }
    }
    if (endSec > deliveryEnd) {
        if (startSec >= deliveryEnd) {
            idleSec += endSec - startSec;
        } else {
            idleSec += endSec - deliveryEnd;
        }
    }

    let idleTime = convertToHMS(idleSec);
    let activeSec = (endSec - startSec) - idleSec;
    if (activeSec < 0) activeSec = 0;
    let activeTime = convertToHMS(activeSec);

    let dateParts = date.split('-');
    let year = parseInt(dateParts[0]);
    let month = parseInt(dateParts[1]);
    let day = parseInt(dateParts[2]);
    let quota = 8 * 3600 + 24 * 60;
    if (year === 2025 && month === 4 && day >= 10 && day <= 30) {
        quota = 6 * 3600;
    }
    let metQuotaVal = activeSec >= quota;

    let newObj = {
        driverID: driverID,
        driverName: driverName,
        date: date,
        startTime: startTime,
        endTime: endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: metQuotaVal,
        hasBonus: false
    };

    let newLine = driverID + ',' + driverName + ',' + date + ',' + startTime + ',' + endTime + ',' + shiftDuration + ',' + idleTime + ',' + activeTime + ',' + metQuotaVal + ',false';

    let lastDriverIdx = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        if (lines[i].split(',')[0] === driverID) lastDriverIdx = i;
    }

    let lastNonEmpty = lines.length - 1;
    while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty--;

    let insertAt;
    if (lastDriverIdx !== -1) {
        insertAt = lastDriverIdx + 1;
    } else {
        insertAt = lastNonEmpty + 1;
    }

    lines.splice(insertAt, 0, newLine);
    if (lines[lines.length - 1] !== '') lines.push('');

    fs.writeFileSync(textFile, lines.join('\n'), { encoding: 'utf8' });
    return newObj;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let content = fs.readFileSync(textFile, { encoding: 'utf8' });
    let lines = content.split('\n');

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        let cols = lines[i].split(',');
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = String(newValue);
            lines[i] = cols.join(',');
            break;
        }
    }

    fs.writeFileSync(textFile, lines.join('\n'), { encoding: 'utf8' });
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, { encoding: 'utf8' });
    let lines = content.split('\n');
    let targetMonth = parseInt(month);
    let found = false;
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        let cols = lines[i].split(',');
        if (cols[0] === driverID) {
            found = true;
            let lineMonth = parseInt(cols[2].split('-')[1]);
            if (lineMonth === targetMonth && cols[9].trim() === 'true') {
                count++;
            }
        }
    }

    return found ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let content = fs.readFileSync(textFile, { encoding: 'utf8' });
    let lines = content.split('\n');
    let targetMonth = parseInt(month);
    let totalSec = 0;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        let cols = lines[i].split(',');
        if (cols[0] === driverID) {
            let lineMonth = parseInt(cols[2].split('-')[1]);
            if (lineMonth === targetMonth) {
                totalSec += convertToSeconds(cols[7]);
            }
        }
    }

    return convertToHMS(totalSec);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let rateContent = fs.readFileSync(rateFile, { encoding: 'utf8' });
    let rateLines = rateContent.split('\n');
    let dayOff = '';

    for (let i = 0; i < rateLines.length; i++) {
        if (rateLines[i].trim() === '') continue;
        let cols = rateLines[i].split(',');
        if (cols[0] === driverID) {
            dayOff = cols[1].trim();
            break;
        }
    }

    let dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let targetMonth = parseInt(month);

    let shiftContent = fs.readFileSync(textFile, { encoding: 'utf8' });
    let shiftLines = shiftContent.split('\n');
    let totalSec = 0;

    for (let i = 1; i < shiftLines.length; i++) {
        if (shiftLines[i].trim() === '') continue;
        let cols = shiftLines[i].split(',');
        if (cols[0] !== driverID) continue;

        let lineMonth = parseInt(cols[2].split('-')[1]);
        if (lineMonth !== targetMonth) continue;

        let dateParts = cols[2].split('-');
        let y = parseInt(dateParts[0]);
        let mo = parseInt(dateParts[1]);
        let d = parseInt(dateParts[2]);

        let shiftDay = dayNames[new Date(y, mo - 1, d).getDay()];
        if (shiftDay === dayOff) continue;

        let dailyQuota = 8 * 3600 + 24 * 60;
        if (y === 2025 && mo === 4 && d >= 10 && d <= 30) {
            dailyQuota = 6 * 3600;
        }
        totalSec += dailyQuota;
    }

    totalSec -= bonusCount * 2 * 3600;
    if (totalSec < 0) totalSec = 0;

    return convertToHMS(totalSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rateContent = fs.readFileSync(rateFile, { encoding: 'utf8' });
    let rateLines = rateContent.split('\n');
    let basePay = 0;
    let tier = 0;

    for (let i = 0; i < rateLines.length; i++) {
        if (rateLines[i].trim() === '') continue;
        let cols = rateLines[i].split(',');
        if (cols[0] === driverID) {
            basePay = parseInt(cols[2]);
            tier = parseInt(cols[3]);
            break;
        }
    }

    let actualSec = convertToSeconds(actualHours);
    let requiredSec = convertToSeconds(requiredHours);

    if (actualSec >= requiredSec) return basePay;

    let missingSec = requiredSec - actualSec;

    let allowedHours = 0;
    if (tier === 1) allowedHours = 50;
    else if (tier === 2) allowedHours = 20;
    else if (tier === 3) allowedHours = 10;
    else if (tier === 4) allowedHours = 3;

    let allowedSec = allowedHours * 3600;
    let billableSec = missingSec - allowedSec;

    if (billableSec <= 0) return basePay;

    let billableHours = Math.floor(billableSec / 3600);
    let deductionRate = Math.floor(basePay / 185);
    let deduction = billableHours * deductionRate;

    return basePay - deduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
