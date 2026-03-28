import { getPublicSettings } from "@booking/core";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> | { slug: string } },
) {
  try {
    const { slug } = await context.params;
    return NextResponse.json(getPublicSettings(slug));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tenant non trovato." },
      { status: 404 },
    );
  }
}
