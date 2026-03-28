import type { Booking } from "./domain";

export interface ChannelAdapter {
  provider: string;
  syncAvailability(tenantId: string, fromDate: string, toDate: string): Promise<void>;
  pushBooking(booking: Booking): Promise<void>;
  disconnect(tenantId: string): Promise<void>;
}

export class NullChannelAdapter implements ChannelAdapter {
  provider = "none";

  async syncAvailability() {
    return;
  }

  async pushBooking() {
    return;
  }

  async disconnect() {
    return;
  }
}
