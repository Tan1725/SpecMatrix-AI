import { NextResponse } from "next/server";
import { SUPPORTED_DATASHEET_FORMATS, EXTRACTION_CONFIDENCE_THRESHOLDS } from "../../../lib/constants";

export async function GET() {
    return NextResponse.json({
        service: "SpecMatrix-AI Ingestion Engine",
        version: "1.1.0",
        engine: "Gemini 2.5 Flash",
        supportedFormats: SUPPORTED_DATASHEET_FORMATS,
        confidenceThresholds: EXTRACTION_CONFIDENCE_THRESHOLDS,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
}
