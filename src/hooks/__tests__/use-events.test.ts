import { beforeEach, describe, expect, it, vi } from "vitest";

const invalidateQueries = vi.fn();
const useQueryClient = vi.fn(() => ({ invalidateQueries }));
const useMutation = vi.fn((options: unknown) => options);
const useQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => useMutation(options),
  useQueryClient: () => useQueryClient(),
  useQuery: (options: unknown) => useQuery(options),
}));

import {
  useCreateEvent,
  useDeleteEvent,
  useCancelEvent,
} from "../use-events";

describe("use-events cache invalidation", () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    useQueryClient.mockClear();
    useMutation.mockClear();
  });

  it("invalidates scheduled notifications after event create", () => {
    const mutation = useCreateEvent() as { onSuccess?: () => void };
    mutation.onSuccess?.();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["events", "list"] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["notifications", "scheduled"],
    });
  });

  it("invalidates scheduled notifications after event delete", () => {
    const mutation = useDeleteEvent() as { onSuccess?: () => void };
    mutation.onSuccess?.();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["events", "list"] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["notifications", "scheduled"],
    });
  });

  it("invalidates scheduled notifications after event cancel", () => {
    const mutation = useCancelEvent() as {
      onSuccess?: (_data: unknown, vars: { id: string }) => void;
    };
    mutation.onSuccess?.({}, { id: "event-1" });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["events", "detail", "event-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["notifications", "scheduled"],
    });
  });
});

