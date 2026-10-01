export function normalizeMpn(rawMpn: string): string {
    if (!rawMpn) return "";
    return rawMpn
        .trim()
        .toUpperCase()
        .replace(/[\s	
]+/g, "")
        .replace(/[^A-Z0-9\-\_\/\.]/g, "");
}

export function formatElectricalValue(value: number, unit: string): string {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M${unit}`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} k${unit}`;
    if (value < 1e-6) return `${(value * 1e9).toFixed(2)} n${unit}`;
    if (value < 1e-3) return `${(value * 1e6).toFixed(2)} u${unit}`;
    if (value < 1) return `${(value * 1e3).toFixed(2)} m${unit}`;
    return `${value.toFixed(2)} ${unit}`;
}

export function formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
