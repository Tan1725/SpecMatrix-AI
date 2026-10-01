export const SUPPORTED_DATASHEET_FORMATS = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp"
] as const;

export const EXTRACTION_CONFIDENCE_THRESHOLDS = {
    HIGH: 0.90,
    MEDIUM: 0.75,
    LOW: 0.50
} as const;

export const DEFAULT_TAXONOMY_CATEGORIES = [
    "Passive Components",
    "Semiconductors",
    "Electromechanical",
    "Connectors",
    "Optoelectronics",
    "Power Supplies",
    "Sensors"
] as const;
