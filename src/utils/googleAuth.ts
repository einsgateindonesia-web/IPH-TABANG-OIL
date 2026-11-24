import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  buildAppendTargets,
  buildFormattingRequests,
  buildSheetSyncPlan,
  type ExistingSheetMeta,
  type WorksheetSpec,
} from './spreadsheetBuilder';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

// In-memory access token cache ONLY (never persisted to localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Token akses Google Sheets tidak diterima. Silakan coba login ulang.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = null;
}

export async function logoutGoogle(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export class SheetsAuthExpiredError extends Error {
  constructor(message = 'Sesi izin Google Sheets telah berakhir. Silakan Sign in ulang.') {
    super(message);
    this.name = 'SheetsAuthExpiredError';
  }
}

async function sheetsFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new SheetsAuthExpiredError();
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  } & T;

  if (!res.ok) {
    const apiMsg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Google Sheets API gagal: ${apiMsg}`);
  }

  return data;
}

export interface CreatedSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

export async function createGoogleSpreadsheet(
  title: string,
  worksheets: WorksheetSpec[],
  token: string
): Promise<CreatedSpreadsheetResult> {
  if (worksheets.length === 0) {
    throw new Error('Pilih minimal satu sheet untuk dibuat.');
  }

  // 1. Create spreadsheet with exact worksheet titles
  const created = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: { properties: { sheetId: number; title: string } }[];
  }>('https://sheets.googleapis.com/v4/spreadsheets', token, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title: title.trim() || 'IP Plant Hauling - Oil & Lubricant Log',
      },
      sheets: worksheets.map((ws) => ({
        properties: {
          title: ws.title,
        },
      })),
    }),
  });

  const sheetIdByTitle = new Map<string, number>();
  for (const s of created.sheets ?? []) {
    sheetIdByTitle.set(s.properties.title, s.properties.sheetId);
  }

  // 2. Write cell values across all created tabs
  const plan = buildSheetSyncPlan(
    (created.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
    worksheets
  );

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: plan.valueRanges.map((vr) => ({
          range: vr.range,
          majorDimension: 'ROWS',
          values: vr.values,
        })),
      }),
    }
  );

  // 3. Apply navy header, zebra row shading, borders, freeze row & widths
  const formatRequests = buildFormattingRequests(sheetIdByTitle, worksheets);
  if (formatRequests.length > 0) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: formatRequests,
        }),
      }
    );
  }

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    title: created.properties?.title || title,
  };
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: ExistingSheetMeta[];
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  token: string
): Promise<SpreadsheetMetadata> {
  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: { properties: { sheetId: number; title: string } }[];
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    token
  );

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: data.properties?.title || spreadsheetId,
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function updateGoogleSpreadsheet(
  spreadsheetId: string,
  worksheets: WorksheetSpec[],
  token: string
): Promise<CreatedSpreadsheetResult> {
  if (worksheets.length === 0) {
    throw new Error('Pilih minimal satu sheet untuk diperbarui.');
  }

  // Always fetch existing sheet metadata first (never assume "Sheet1")
  const meta = await fetchSpreadsheetMetadata(spreadsheetId, token);
  const plan = buildSheetSyncPlan(meta.sheets, worksheets);

  const sheetIdByTitle = new Map<string, number>();
  for (const s of meta.sheets) {
    sheetIdByTitle.set(s.title, s.sheetId);
  }

  // 1. Add any missing tabs
  if (plan.tabsToCreate.length > 0) {
    const addRes = await sheetsFetch<{
      replies: { addSheet?: { properties: { sheetId: number; title: string } } }[];
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: plan.tabsToCreate.map((tabTitle) => ({
            addSheet: { properties: { title: tabTitle } },
          })),
        }),
      }
    );

    for (const reply of addRes.replies ?? []) {
      const props = reply.addSheet?.properties;
      if (props) {
        sheetIdByTitle.set(props.title, props.sheetId);
      }
    }
  }

  // 2. Clear existing target tabs before writing updated rows
  if (plan.clearRanges.length > 0) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchClear`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          ranges: plan.clearRanges,
        }),
      }
    );
  }

  // 3. Write updated values
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: plan.valueRanges.map((vr) => ({
          range: vr.range,
          majorDimension: 'ROWS',
          values: vr.values,
        })),
      }),
    }
  );

  // 4. Re-apply consistent formatting
  const formatRequests = buildFormattingRequests(sheetIdByTitle, worksheets);
  if (formatRequests.length > 0) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: formatRequests,
        }),
      }
    );
  }

  return {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    title: meta.title,
  };
}

export async function appendGoogleSpreadsheet(
  spreadsheetId: string,
  worksheets: WorksheetSpec[],
  token: string
): Promise<CreatedSpreadsheetResult> {
  if (worksheets.length === 0) {
    throw new Error('Pilih minimal satu sheet untuk ditambahkan.');
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId, token);
  const existingTitles = new Set(meta.sheets.map((s) => s.title));
  const sheetIdByTitle = new Map<string, number>();
  for (const s of meta.sheets) {
    sheetIdByTitle.set(s.title, s.sheetId);
  }

  // 1. Create missing tabs first
  const missingTabs = worksheets
    .map((w) => w.title)
    .filter((t) => !existingTitles.has(t));

  if (missingTabs.length > 0) {
    const addRes = await sheetsFetch<{
      replies: { addSheet?: { properties: { sheetId: number; title: string } } }[];
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map((tabTitle) => ({
            addSheet: { properties: { title: tabTitle } },
          })),
        }),
      }
    );

    for (const reply of addRes.replies ?? []) {
      const props = reply.addSheet?.properties;
      if (props) {
        sheetIdByTitle.set(props.title, props.sheetId);
      }
    }
  }

  // 2. Check which existing tabs already have row 1 populated so we don't duplicate headers
  const tabsToCheck = worksheets
    .filter((w) => existingTitles.has(w.title))
    .map((w) => `'${w.title.replace(/'/g, "''")}'!A1:A1`);

  const tabsWithHeaderPresent = new Set<string>();
  if (tabsToCheck.length > 0) {
    const query = tabsToCheck
      .map((r) => `ranges=${encodeURIComponent(r)}`)
      .join('&');
    const checkRes = await sheetsFetch<{
      valueRanges?: { range: string; values?: unknown[][] }[];
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${query}`,
      token
    );

    worksheets
      .filter((w) => existingTitles.has(w.title))
      .forEach((ws, idx) => {
        const vr = checkRes.valueRanges?.[idx];
        if (vr?.values && vr.values.length > 0 && vr.values[0].length > 0) {
          tabsWithHeaderPresent.add(ws.title);
        }
      });
  }

  // 3. Append rows to each target tab
  const appendTargets = buildAppendTargets(tabsWithHeaderPresent, worksheets);
  const newlyFormattedSpecs: WorksheetSpec[] = [];

  for (const target of appendTargets) {
    if (target.values.length === 0) continue;
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(
        target.range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: target.values,
        }),
      }
    );

    if (target.needsHeader) {
      const spec = worksheets.find((w) => w.title === target.title);
      if (spec) newlyFormattedSpecs.push(spec);
    }
  }

  // 4. Format any tabs that were newly initialized with headers
  if (newlyFormattedSpecs.length > 0) {
    const formatRequests = buildFormattingRequests(
      sheetIdByTitle,
      newlyFormattedSpecs
    );
    if (formatRequests.length > 0) {
      await sheetsFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ requests: formatRequests }),
        }
      );
    }
  }

  return {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    title: meta.title,
  };
}
