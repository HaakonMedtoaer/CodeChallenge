// Tier 1 — Sequence tracing. Straight-line code, no bugs.
// Confirms you can follow control flow before you are asked to spot problems.
window.EXERCISES = (window.EXERCISES || []).concat([

{
  id: "t1-01", tier: 1,
  scenario: "Order total for a webshop cart",
  ask: "Sum the line items, and take 10% off if the total is over 100.",
  code: `def order_total(items):
    total = 0
    for item in items:
        total += item["price"] * item["qty"]
    if total > 100:
        total = total * 0.9
    return round(total, 2)

print(order_total([{"price": 20, "qty": 3}, {"price": 15, "qty": 4}]))`,
  key: {
    trace: [
      "total starts at 0.",
      "First item: 20 x 3 = 60, so total is 60.",
      "Second item: 15 x 4 = 60, so total is 120.",
      "120 > 100, so total becomes 120 * 0.9 = 108.0.",
      "Prints 108.0.",
    ],
    runtime: { crashes: false, where: null, why: "Every value is a number and every key exists. Nothing raises." },
    logic: { matches: true, note: "Sums the lines, applies the discount above the stated threshold. This is what was asked." },
    stakes: "Nothing here is wrong. The point is confirming you can follow a loop and a branch without second-guessing yourself.",
  },
  bugs: [],
},

{
  id: "t1-02", tier: 1,
  scenario: "Labelling a shift from the hour of day",
  ask: "Map an hour (0-23) to night, morning or afternoon.",
  code: `def shift_label(hour):
    if hour < 6:
        return "night"
    elif hour < 14:
        return "morning"
    elif hour < 22:
        return "afternoon"
    return "night"

for h in [3, 9, 15, 23]:
    print(h, shift_label(h))`,
  key: {
    trace: [
      "3 < 6, returns 'night'.",
      "9 is not < 6, but is < 14, returns 'morning'.",
      "15 fails both, but is < 22, returns 'afternoon'.",
      "23 fails all three and falls through to the final return, 'night'.",
      "Prints the four lines in that order.",
    ],
    runtime: { crashes: false, where: null, why: "Plain integer comparisons, and every path returns a value." },
    logic: { matches: true, note: "The elif chain means each branch runs only when the earlier ones did not, so the bands cannot overlap." },
    stakes: "Clean. Worth noticing the final return is reachable only by hours 22 and 23 — the chain is doing that work, not the condition.",
  },
  bugs: [],
},

{
  id: "t1-03", tier: 1,
  scenario: "Picking users for a re-engagement email",
  ask: "Collect the names of users who are active and have logged in at least once, upper-cased.",
  code: `users = [
    {"name": "ana", "active": True, "logins": 12},
    {"name": "bo", "active": False, "logins": 3},
    {"name": "cy", "active": True, "logins": 0},
]
names = []
for u in users:
    if u["active"] and u["logins"] > 0:
        names.append(u["name"].upper())
print(names)`,
  key: {
    trace: [
      "ana: active is True and 12 > 0, so 'ANA' is appended.",
      "bo: active is False, so the `and` short-circuits and the login check never runs.",
      "cy: active is True, but 0 > 0 is False, so cy is skipped.",
      "Prints ['ANA'].",
    ],
    runtime: { crashes: false, where: null, why: "Every dict has all three keys, and every value is the type the operation expects." },
    logic: { matches: true, note: "Both conditions from the ask are enforced, and the name is upper-cased as requested." },
    stakes: "Clean. Note that bo and cy are excluded for different reasons — one by the flag, one by the count.",
  },
  bugs: [],
},

{
  id: "t1-04", tier: 1,
  scenario: "Counting support tickets by status",
  ask: "Return a dict mapping each status to how many tickets have it.",
  code: `def count_by_status(tickets):
    counts = {}
    for t in tickets:
        status = t["status"]
        if status not in counts:
            counts[status] = 0
        counts[status] += 1
    return counts

print(count_by_status([
    {"id": 1, "status": "open"},
    {"id": 2, "status": "closed"},
    {"id": 3, "status": "open"},
]))`,
  key: {
    trace: [
      "counts starts empty.",
      "Ticket 1: 'open' is not in counts, so it is seeded to 0, then incremented to 1.",
      "Ticket 2: 'closed' is new, seeded to 0 then incremented to 1.",
      "Ticket 3: 'open' already exists, so the seed is skipped and it goes to 2.",
      "Prints {'open': 2, 'closed': 1}.",
    ],
    runtime: { crashes: false, where: null, why: "The `if status not in counts` guard is precisely what stops a KeyError on the += line." },
    logic: { matches: true, note: "Counts every ticket exactly once, keyed by status." },
    stakes: "Clean. That guard is the whole exercise — delete it and this becomes a crash.",
  },
  bugs: [],
},

{
  id: "t1-05", tier: 1,
  scenario: "Finding the first overdue invoice",
  ask: "Return the id of the first invoice due before today, or None if there is none.",
  code: `def find_first_overdue(invoices, today):
    i = 0
    while i < len(invoices):
        if invoices[i]["due"] < today:
            return invoices[i]["id"]
        i += 1
    return None

invs = [{"id": "A", "due": 10}, {"id": "B", "due": 5}, {"id": "C", "due": 3}]
print(find_first_overdue(invs, 7))`,
  key: {
    trace: [
      "i = 0: invoice A is due at 10, and 10 < 7 is False, so i becomes 1.",
      "i = 1: invoice B is due at 5, and 5 < 7 is True, so it returns 'B' immediately.",
      "Invoice C is never examined — the return exits the whole function, not just the loop.",
      "Prints B.",
    ],
    runtime: { crashes: false, where: null, why: "The `while i < len(invoices)` condition is checked before every index access, so it can never run past the end." },
    logic: { matches: true, note: "Returns the first match in list order, and None when nothing matches." },
    stakes: "Clean. The early return is load-bearing — 'first' means the loop has to stop, not keep going and overwrite.",
  },
  bugs: [],
},

{
  id: "t1-06", tier: 1,
  scenario: "Formatting a postal address",
  ask: "Join the address parts with commas, including the country only when one is given.",
  code: `def format_address(street, city, zipcode, country=None):
    parts = [street, city, zipcode]
    if country:
        parts.append(country)
    return ", ".join(parts)

print(format_address("12 Elm St", "Oslo", "0150"))
print(format_address("12 Elm St", "Oslo", "0150", "Norway"))`,
  key: {
    trace: [
      "First call: country defaults to None, which is falsy, so nothing is appended.",
      "parts is ['12 Elm St', 'Oslo', '0150'], joined into '12 Elm St, Oslo, 0150'.",
      "Second call: country is 'Norway', which is truthy, so it is appended before the join.",
      "Prints the same line a second time with ', Norway' on the end.",
    ],
    runtime: { crashes: false, where: null, why: "Every element handed to join is a string. A None in that list would raise, but None never gets appended." },
    logic: { matches: true, note: "The country appears only when supplied, as asked." },
    stakes: "Clean — and worth holding onto. `None` as a default is harmless because it is immutable and never mutated. A `[]` default is the one that bites.",
  },
  bugs: [],
},

{
  id: "t1-07", tier: 1,
  scenario: "Assigning teams to meeting rooms",
  ask: "Give each team the first room that fits it.",
  code: `def pair_up(teams, rooms):
    pairs = []
    for t in teams:
        for r in rooms:
            if r["cap"] >= t["size"]:
                pairs.append((t["name"], r["id"]))
                break
    return pairs

teams = [{"name": "alpha", "size": 4}, {"name": "beta", "size": 9}]
rooms = [{"id": "R1", "cap": 6}, {"id": "R2", "cap": 12}]
print(pair_up(teams, rooms))`,
  key: {
    trace: [
      "alpha has size 4. R1 has capacity 6, and 6 >= 4, so ('alpha', 'R1') is appended and break fires.",
      "The break exits only the inner room loop, so the team loop carries on.",
      "beta has size 9. R1 capacity 6 is not >= 9, so skip. R2 capacity 12 is, so ('beta', 'R2') is appended.",
      "Prints [('alpha', 'R1'), ('beta', 'R2')].",
    ],
    runtime: { crashes: false, where: null, why: "Nested iteration over lists of complete dicts. No indexing, so nothing to overrun." },
    logic: { matches: true, note: "The first fitting room wins, which is what 'the first room that fits' means." },
    stakes: "Clean. Being sure which loop `break` exits matters — that distinction turns up in real bugs constantly.",
  },
  bugs: [],
},

{
  id: "t1-08", tier: 1,
  scenario: "Parsing amounts from an uploaded file",
  ask: "Convert each row to a number, using 0.0 for anything that will not parse.",
  code: `def parse_amounts(rows):
    amounts = []
    for row in rows:
        try:
            amounts.append(float(row))
        except ValueError:
            amounts.append(0.0)
    return amounts

print(parse_amounts(["10.5", "abc", "3"]))`,
  key: {
    trace: [
      "'10.5' converts cleanly to 10.5 and is appended.",
      "'abc' makes float() raise ValueError, the except catches it, and 0.0 is appended instead.",
      "'3' converts to 3.0 and is appended.",
      "Prints [10.5, 0.0, 3.0].",
    ],
    runtime: { crashes: false, where: null, why: "The except catches the one error float() raises for this input, so the loop always completes." },
    logic: { matches: true, note: "Unparseable rows become 0.0, exactly as the ask states. The error handling is deliberate and narrow." },
    stakes: "Clean — and this is the good version of error handling: one named exception, caught for a stated reason. A bare `except:` doing the same job is a defect you will meet later.",
  },
  bugs: [],
},

{
  id: "t1-09", tier: 1,
  scenario: "Leaderboard for an internal contest",
  ask: "Return the three highest scores, highest first.",
  code: `def top_three(scores):
    ordered = sorted(scores, reverse=True)
    return ordered[:3]

print(top_three([55, 91, 72, 12, 88]))`,
  key: {
    trace: [
      "sorted(scores, reverse=True) produces [91, 88, 72, 55, 12]. The original list is left alone.",
      "The slice [:3] takes the first three of that.",
      "Prints [91, 88, 72].",
    ],
    runtime: { crashes: false, where: null, why: "A slice never raises for being too long — [:3] on a two-item list just returns two items. An index would raise where a slice does not." },
    logic: { matches: true, note: "Highest first, capped at three." },
    stakes: "Clean. That slice-versus-index difference is exactly what makes several later exercises crash.",
  },
  bugs: [],
},

{
  id: "t1-10", tier: 1,
  scenario: "Applying account credits and charges",
  ask: "Subtract refunds from the balance and add everything else. A missing amount counts as zero.",
  code: `def apply_credits(balance, credits):
    for c in credits:
        amount = c.get("amount", 0)
        if c.get("type") == "refund":
            balance -= amount
        else:
            balance += amount
    return balance

print(apply_credits(100, [
    {"type": "refund", "amount": 30},
    {"type": "charge", "amount": 10},
    {"type": "charge"},
]))`,
  key: {
    trace: [
      "balance starts at 100.",
      "First entry is a refund of 30, so balance becomes 70.",
      "Second is a charge of 10, so balance becomes 80.",
      "Third has no 'amount' key, so .get returns the default 0 and balance stays 80.",
      "Prints 80.",
    ],
    runtime: { crashes: false, where: null, why: "Both .get calls supply a default, so the missing key on the third entry never raises." },
    logic: { matches: true, note: "Refunds subtract, everything else adds, absent amounts are treated as zero — all three stated rules." },
    stakes: "Clean. `.get(key, default)` is the guard. Writing `c['amount']` there instead would be a KeyError on the third entry.",
  },
  bugs: [],
},

]);
