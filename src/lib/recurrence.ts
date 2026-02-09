import { RRule, type Options as RRuleOptions } from "rrule";

export interface RecurrenceOptions {
  frequency: "weekly" | "biweekly" | "monthly";
  dayOfWeek?: number; // 0=Monday...6=Sunday (RRule convention)
  until?: string; // ISO date string
  count?: number;
}

const freqMap = {
  weekly: RRule.WEEKLY,
  biweekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};

export function buildRRule(options: RecurrenceOptions): string {
  const rruleOptions: Partial<RRuleOptions> = {
    freq: freqMap[options.frequency],
  };

  if (options.frequency === "biweekly") {
    rruleOptions.interval = 2;
  }

  if (options.dayOfWeek !== undefined) {
    rruleOptions.byweekday = [options.dayOfWeek];
  }

  if (options.until) {
    rruleOptions.until = new Date(options.until);
  } else if (options.count) {
    rruleOptions.count = options.count;
  }

  const rule = new RRule(rruleOptions);
  return rule.toString().replace("RRULE:", "");
}

export function parseRRule(ruleStr: string): RecurrenceOptions {
  const rule = RRule.fromString(`RRULE:${ruleStr}`);
  const opts = rule.origOptions;

  let frequency: RecurrenceOptions["frequency"] = "weekly";
  if (opts.freq === RRule.MONTHLY) {
    frequency = "monthly";
  } else if (opts.interval === 2) {
    frequency = "biweekly";
  }

  return {
    frequency,
    dayOfWeek:
      opts.byweekday && Array.isArray(opts.byweekday)
        ? typeof opts.byweekday[0] === "number"
          ? opts.byweekday[0]
          : (opts.byweekday[0] as { weekday: number }).weekday
        : undefined,
    until: opts.until ? opts.until.toISOString() : undefined,
    count: opts.count ?? undefined,
  };
}

export function generateOccurrences(
  ruleStr: string,
  startDate: Date,
  rangeEnd?: Date,
): Date[] {
  const rule = RRule.fromString(`RRULE:${ruleStr}`);

  // Default to 6 months from start if no range end given
  const end =
    rangeEnd ?? new Date(startDate.getTime() + 180 * 24 * 60 * 60 * 1000);

  // RRule needs dtstart set
  const ruleWithStart = new RRule({
    ...rule.origOptions,
    dtstart: startDate,
  });

  return ruleWithStart.between(startDate, end, true);
}

export function humanizeRRule(ruleStr: string): string {
  try {
    const rule = RRule.fromString(`RRULE:${ruleStr}`);
    return rule.toText();
  } catch {
    return ruleStr;
  }
}
