const SHEET_ID = "1WSQMXxEAWVqeSBcEiYPWZ8HAL5d9y0Rdcel6xupbTPI";
const SHEET_NAME = "OrderCycle";
const DRIVE_FOLDER_ID = "";

// Returned-by-EA markers (created/used by EA portal; also read/cleared here)
const RETURN_STATE_HEADER = "EA_SEGMENT_STATE";
const RETURN_REMARK_HEADER = "EA_SEGMENT_REMARK";
const RETURNED_AT_HEADER = "EA_SEGMENT_RETURNED_AT";

const COL = {
  B: 2,
  C: 3,
  D: 4,
  F: 6,
  K: 11,
  N: 14,
  O: 15,
  AB: 28,
  AC: 29,
  AI: 35,
  AQ: 43,
  AR: 44,
  AS: 45,
  BD: 56,
  AT: 46,
  AU: 47
};

let __headerColIndexCache = {};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";

  if (action === "FETCH_ELIGIBLE") {
    const data = fetchEligibleRows();
    return corsJson({ ok: true, data: data });
  }

  if (action === "OPTIONS") {
    return corsText("");
  }

  return corsJson({ ok: false, error: "Unknown action." });
}

function doPost(e) {
  let payload;
  try {
    const contents = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    payload = JSON.parse(contents);
  } catch (error) {
    return corsJson({ ok: false, error: "Invalid JSON body." });
  }

  if (!payload || !payload.action) {
    return corsJson({ ok: false, error: "Missing action." });
  }

  try {
    if (payload.action === "UPLOAD_FINAL") {
      return corsJson(handleFinalUpload(payload));
    }

    if (payload.action === "UPLOAD_ADDITIONAL") {
      return corsJson(handleAdditionalUpload(payload));
    }

    return corsJson({ ok: false, error: "Unknown action." });
  } catch (error) {
    return corsJson({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function fetchEligibleRows() {
  const sheet = getSheet();
  const stateCol = getOrCreateColumnIndexByHeader(sheet, RETURN_STATE_HEADER);
  const remarkCol = getOrCreateColumnIndexByHeader(sheet, RETURN_REMARK_HEADER);
  const returnedAtCol = getOrCreateColumnIndexByHeader(sheet, RETURNED_AT_HEADER);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const orderId = String(row[COL.BD - 1] || "").trim();
    const approval = String(row[COL.K - 1] || "").trim();
    const finalUrl = String(row[COL.O - 1] || "").trim();

    if (!orderId) {
      continue;
    }

    const acList = parseCsv(row[COL.AC - 1]);
    const arGroupCsvs = parseGroupCsvStrings(row[COL.AR - 1]);

    const pendingAdditional = [];
    for (let a = 0; a < acList.length; a++) {
      const groupCsv = a < arGroupCsvs.length ? arGroupCsvs[a] : "";
      if (parseCsv(groupCsv).length === 0) {
        pendingAdditional.push(acList[a]);
      }
    }

    const returnedSegments = getReturnedSegmentsForRow(
      row,
      finalUrl,
      acList,
      stateCol,
      remarkCol,
      returnedAtCol
    );

    const hasReturned = returnedSegments.length > 0;
    const hasReturnedAdditional = returnedSegments.some((seg) => seg.segmentIndex > 0);
    const returnedAdditionalUrls = returnedSegments
      .filter((seg) => seg.segmentIndex > 0)
      .map((seg) => seg.segmentUrl)
      .filter(Boolean);

    // Keep existing criteria unchanged for non-returned orders.
    if (!hasReturned && (approval !== "Approve" || !finalUrl)) {
      continue;
    }

    const finalAttached = !isBlank(row[COL.AQ - 1]);
    const finalReturned = returnedSegments.some((seg) => seg.segmentIndex === 0);
    const finalEligible = finalReturned || !finalAttached;

    const additionalEligible = pendingAdditional.length > 0 || hasReturnedAdditional;
    const additionalUrlsForUi = pendingAdditional.length ? pendingAdditional : returnedAdditionalUrls;
    const additionalEligibleForUi = additionalUrlsForUi.length > 0;

    if (!finalEligible && !additionalEligible) {
      continue;
    }

    const finalTimestamp = normalizeTimestamp(row[COL.N - 1]);
    const additionalTimestamp = normalizeTimestamp(row[COL.AS - 1]);
    const returnedPrimary = computeReturnedPrimaryTimestamp(returnedSegments);
    const primaryTimestamp =
      returnedPrimary ||
      computePrimaryTimestamp(
        finalEligible,
        additionalEligible,
        finalTimestamp,
        additionalTimestamp
      );

    rows.push({
      orderId: orderId,
      dealerName: row[COL.B - 1] || "",
      marketingPerson: row[COL.C - 1] || "",
      location: row[COL.D - 1] || "",
      crm: row[COL.F - 1] || "",
      concernedOwner: row[COL.AB - 1] || "",
      color: row[COL.AI - 1] || "",
      returnedSegments: returnedSegments,
      final: {
        url: finalUrl,
        timestamp: finalTimestamp,
        // Avoid rendering a broken "View" link if final URL is missing.
        eligible: Boolean(finalUrl) && finalEligible
      },
      additional: {
        urlsPending: additionalUrlsForUi,
        timestamp: additionalTimestamp,
        eligible: additionalEligibleForUi
      },
      primaryTimestamp: primaryTimestamp
    });
  }

  return rows;
}

function handleFinalUpload(payload) {
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    throw new Error("orderId is required.");
  }

  const files = sanitizeFiles(payload.files);
  if (!files.length) {
    throw new Error("No files to upload.");
  }

  return withSheetLock(function () {
    const sheet = getSheet();
    const rowIndex = findRowByOrderId(sheet, orderId);
    if (!rowIndex) {
      throw new Error("Order ID not found.");
    }

    const folder = getUploadFolder();
    const links = uploadFiles(folder, orderId, "FINAL", files);

    sheet.getRange(rowIndex, COL.AQ).setValue(links.join(","));
    const actualFinal = new Date();
    sheet.getRange(rowIndex, COL.AT).setValue(actualFinal);
    clearReturnedForSegment(sheet, rowIndex, 0);
    return { ok: true, links: links };
  });
}

function handleAdditionalUpload(payload) {
  const orderId = String(payload.orderId || "").trim();
  const additionalUrl = String(payload.additionalUrl || "").trim();

  if (!orderId) {
    throw new Error("orderId is required.");
  }

  if (!additionalUrl) {
    throw new Error("additionalUrl is required.");
  }

  const files = sanitizeFiles(payload.files);
  if (!files.length) {
    throw new Error("No files to upload.");
  }

  return withSheetLock(function () {
    const sheet = getSheet();
    const rowIndex = findRowByOrderId(sheet, orderId);
    if (!rowIndex) {
      throw new Error("Order ID not found.");
    }

    const folder = getUploadFolder();
    const links = uploadFiles(folder, orderId, "ADD", files);
    const groupCsv = links.join(",");

    const acList = parseCsv(sheet.getRange(rowIndex, COL.AC).getValue());
    const additionalIndex = acList.indexOf(additionalUrl);
    if (additionalIndex === -1) {
      throw new Error("additionalUrl not found in the order list.");
    }

    const existing = String(sheet.getRange(rowIndex, COL.AR).getValue() || "").trim();
    const groups = parseGroupCsvStrings(existing);
    while (groups.length <= additionalIndex) groups.push("");
    groups[additionalIndex] = groupCsv;

    const updated = groups
      .map(function (value) {
        return String(value || "").trim();
      })
      .join(";");

    const actualAdditional = new Date();
    sheet.getRange(rowIndex, COL.AU).setValue(actualAdditional);
    sheet.getRange(rowIndex, COL.AR).setValue(updated);
    clearReturnedForSegment(sheet, rowIndex, additionalIndex + 1);
    return { ok: true, links: links };
  });
}

function withSheetLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function sanitizeFiles(files) {
  if (!files || !files.length) return [];

  return files
    .map(function (file) {
      const name = String(file.name || "").trim();
      const mimeType = String(file.mimeType || "application/pdf").trim();
      let base64 = String(file.base64 || "").trim();

      if (!name || !base64) return null;

      const marker = base64.indexOf("base64,");
      if (marker !== -1) {
        base64 = base64.substring(marker + 7);
      }

      return { name: name, mimeType: mimeType, base64: base64 };
    })
    .filter(function (file) {
      return file && file.base64;
    });
}

function uploadFiles(folder, orderId, tag, files) {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd_HHmmss"
  );

  return files.map(function (file) {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(file.base64),
      file.mimeType,
      file.name
    );
    const fileName = `${orderId}__${tag}__${timestamp}__${file.name}`;
    blob.setName(fileName);
    const created = folder.createFile(blob);
    created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return created.getUrl();
  });
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet not found.");
  }
  return sheet;
}

function getUploadFolder() {
  const folderId = resolveDriveFolderId();
  return DriveApp.getFolderById(folderId);
}

function resolveDriveFolderId() {
  if (DRIVE_FOLDER_ID) {
    return DRIVE_FOLDER_ID;
  }

  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty("DRIVE_FOLDER_ID");
  if (stored) {
    return stored;
  }

  const folder = DriveApp.createFolder("NTWoods_O2D_StagingUploads");
  props.setProperty("DRIVE_FOLDER_ID", folder.getId());
  return folder.getId();
}

function findRowByOrderId(sheet, orderId) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return 0;

  const range = sheet.getRange(1, COL.BD, lastRow, 1);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    const value = String(values[i][0] || "").trim();
    if (value === orderId) {
      return i + 1;
    }
  }

  return 0;
}

function getOrCreateColumnIndexByHeader(sheet, headerName) {
  const header = String(headerName || "").trim();
  if (!header) throw new Error("Invalid header.");

  if (__headerColIndexCache[header]) return __headerColIndexCache[header];

  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0];

  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] || "").trim() === header) {
      __headerColIndexCache[header] = i + 1;
      return i + 1;
    }
  }

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(header);
  __headerColIndexCache[header] = newCol;
  return newCol;
}

function splitPipe(value) {
  if (isBlank(value)) return [];
  return String(value)
    .split("|")
    .map(function (item) {
      return String(item || "").trim();
    });
}

function joinPipe(items) {
  if (!items || !items.length) return "";
  return items
    .map(function (item) {
      return String(item || "").trim();
    })
    .join(" | ");
}

function computeReturnedPrimaryTimestamp(returnedSegments) {
  if (!returnedSegments || !returnedSegments.length) return null;

  let minMillis = 0;
  returnedSegments.forEach(function (seg) {
    const millis = toMillis(seg && seg.returnedAt);
    if (!millis) return;
    if (!minMillis || millis < minMillis) minMillis = millis;
  });

  return minMillis ? millisToIso(minMillis) : null;
}

function getReturnedSegmentsForRow(row, finalUrl, additionalUrls, stateCol, remarkCol, returnedAtCol) {
  const states = splitPipe(row[stateCol - 1]);
  if (!states.length) return [];

  const remarks = splitPipe(row[remarkCol - 1]);
  const returnedAts = splitPipe(row[returnedAtCol - 1]);
  const segments = [];

  for (let i = 0; i < states.length; i++) {
    if (String(states[i] || "").trim() !== "RETURNED_BY_EA") continue;

    const segmentIndex = i;
    const segmentLabel = segmentIndex === 0 ? "Final" : `Additional-${segmentIndex}`;
    const segmentUrl =
      segmentIndex === 0
        ? String(finalUrl || "").trim()
        : String((additionalUrls && additionalUrls[segmentIndex - 1]) || "").trim();

    segments.push({
      segmentIndex: segmentIndex,
      segmentLabel: segmentLabel,
      segmentUrl: segmentUrl,
      remark: String((remarks && remarks[i]) || "").trim(),
      returnedAt: String((returnedAts && returnedAts[i]) || "").trim()
    });
  }

  return segments;
}

function clearReturnedForSegment(sheet, rowIndex, segmentIndex) {
  const stateCol = getOrCreateColumnIndexByHeader(sheet, RETURN_STATE_HEADER);
  const remarkCol = getOrCreateColumnIndexByHeader(sheet, RETURN_REMARK_HEADER);
  const returnedAtCol = getOrCreateColumnIndexByHeader(sheet, RETURNED_AT_HEADER);

  const states = splitPipe(sheet.getRange(rowIndex, stateCol).getValue());
  const remarks = splitPipe(sheet.getRange(rowIndex, remarkCol).getValue());
  const returnedAts = splitPipe(sheet.getRange(rowIndex, returnedAtCol).getValue());

  while (states.length <= segmentIndex) states.push("");
  while (remarks.length <= segmentIndex) remarks.push("");
  while (returnedAts.length <= segmentIndex) returnedAts.push("");

  if (String(states[segmentIndex] || "").trim() !== "RETURNED_BY_EA") {
    return;
  }

  states[segmentIndex] = "PENDING_EA_APPROVAL";
  remarks[segmentIndex] = "";
  returnedAts[segmentIndex] = "";

  sheet.getRange(rowIndex, stateCol).setValue(joinPipe(states));
  sheet.getRange(rowIndex, remarkCol).setValue(joinPipe(remarks));
  sheet.getRange(rowIndex, returnedAtCol).setValue(joinPipe(returnedAts));
}

function parseCsv(value) {
  if (isBlank(value)) return [];

  return String(value)
    .split(",")
    .map(function (item) {
      return String(item || "").trim();
    })
    .filter(function (item) {
      return item.length > 0;
    });
}

function parseGroups(value) {
  if (isBlank(value)) return [];

  return String(value)
    .split(";")
    .map(function (item) {
      return String(item || "").trim();
    })
    .filter(function (item) {
      return parseCsv(item).length > 0;
    });
}

function parseGroupCsvStrings(value) {
  if (isBlank(value)) return [];

  return String(value)
    .split(";")
    .map(function (item) {
      return String(item || "").trim();
    });
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeTimestamp(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function computePrimaryTimestamp(finalEligible, additionalEligible, finalTs, additionalTs) {
  const finalMillis = finalEligible ? toMillis(finalTs) : 0;
  const additionalMillis = additionalEligible ? toMillis(additionalTs) : 0;

  if (finalEligible && additionalEligible) {
    return millisToIso(Math.max(finalMillis, additionalMillis));
  }

  if (finalEligible) {
    return finalTs || millisToIso(finalMillis);
  }

  if (additionalEligible) {
    return additionalTs || millisToIso(additionalMillis);
  }

  return null;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function millisToIso(millis) {
  if (!millis) return null;
  return new Date(millis).toISOString();
}

function corsJson(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function corsText(text) {
  const output = ContentService.createTextOutput(text || "");
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}
