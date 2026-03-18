export interface Settings {
  theme: "dark" | "light";
  notifRequireInteraction: boolean;
}

const DEFAULTS: Settings = {
  theme: "dark",
  notifRequireInteraction: true,
};
const SETTINGS_FILE = "./settings.json";

export const settings: Settings = loadSettings();

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(Bun.file(SETTINGS_FILE).textSync());
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(): Promise<void> {
  await Bun.write(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
