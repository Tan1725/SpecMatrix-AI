import { NextRequest, NextResponse } from "next/server";
import { normalizeMpn } from "../../../lib/formatters";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const rawMpn = body.mpn;

        if (!rawMpn || typeof rawMpn !== "string") {
            return NextResponse.json(
                { error: "Field 'mpn' is required and must be a string." },
                { status: 400 }
            );
        }

        const normalized = normalizeMpn(rawMpn);
        const warnings: string[] = [];

        if (normalized.length < 3) {
            warnings.push("MPN is unusually short. Verify if prefix is missing.");
        }

        return NextResponse.json({
            isValid: normalized.length > 0,
            mpn: rawMpn,
            normalizedMpn: normalized,
            warnings
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "Invalid JSON request body." },
            { status: 400 }
        );
    }
}
