export interface PartSpecification {
    mpn: string;
    manufacturer: string;
    description: string;
    category: string;
    packageType?: string;
    operatingTemperature?: {
        min: number;
        max: number;
        unit: "C" | "F";
    };
    attributes: Record<string, string | number | boolean>;
    confidenceScore: number;
}

export interface ExtractionResult {
    id: string;
    fileName: string;
    status: "pending" | "processing" | "completed" | "failed";
    partSpecs: PartSpecification[];
    extractedAt: string;
    processingTimeMs: number;
    error?: string;
}

export interface ValidationResponse {
    isValid: boolean;
    mpn: string;
    normalizedMpn: string;
    warnings: string[];
}
