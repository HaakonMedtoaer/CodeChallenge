// Tier 5 — Clean but subtly wrong.
// Every snippet here runs to completion without raising. There is no crash to
// catch. The only question left is whether it does what was actually asked.
window.EXERCISES = (window.EXERCISES || []).concat([

{
  id: "t5-01", tier: 5,
  scenario: "Applying the spring campaign discount",
  ask: "Give a 10% discount on orders over 500 kr.",
  code: `def apply_discount(order):
    if order["total"] >= 500:
        return round(order["total"] * 0.9, 2)
    return order["total"]

print(apply_discount({"total": 600}))
print(apply_discount({"total": 500}))
print(apply_discount({"total": 499}))`,
  key: {
    trace: [
      "600 is at or above 500, so it is discounted to 540.0.",
      "500 is exactly at the boundary. `>=` includes it, so it is discounted to 450.0.",
      "499 is below, so it is returned untouched.",
      "Prints 540.0, 450.0, 499.",
    ],
    runtime: { crashes: false, where: null, why: "Numeric comparison and multiplication throughout. Nothing here can raise." },
    logic: {
      matches: false,
      note: "The ask says 'over 500'. Over means strictly greater. The code uses `>=`, so an order of exactly 500 gets a discount the campaign never offered.",
    },
    stakes: "One boundary, one character. Individually trivial, and in aggregate it is every order that lands exactly on the round number people actually spend — which is a lot of them. It is also the kind of thing that surfaces in an audit rather than a bug report, because nobody complains about being charged less.",
  },
  bugs: [
    { tag: "missing-edge-case", kind: "logic", what: "`>=` where the ask said 'over', so the boundary value is included when it should not be." },
  ],
},

{
  id: "t5-02", tier: 5,
  scenario: "Reserving the last seat on a course",
  ask: "Reserve a seat only if one is still available.",
  code: `inventory = {"seats": 1}

def confirm(name):
    print("confirmed " + name)

def reserve(name):
    available = inventory["seats"]
    if available > 0:
        confirm(name)
        inventory["seats"] = available - 1
        return True
    return False

print(reserve("ana"))
print(reserve("bo"))
print(inventory)`,
  key: {
    trace: [
      "ana: available is read as 1, which is above 0, so confirm prints and seats is set to 1 - 1 = 0. Returns True.",
      "bo: available is read as 0, the branch is skipped, and it returns False.",
      "Prints the confirmation for ana, True, then False, then {'seats': 0}.",
      "Run one after the other like this, the output is exactly right.",
    ],
    runtime: { crashes: false, where: null, why: "Dict access on a key that exists, integer arithmetic. Nothing raises, and the printed result looks correct." },
    logic: {
      matches: false,
      note: "Two things. The seat count is read, then decided on, then written — and the write uses the stale value it captured rather than re-reading. Two callers arriving together both read 1, both pass the check, both write 0, and two people hold the last seat. Separately, the confirmation is sent before the decrement is committed, so a failure between them leaves a confirmed booking with no seat taken.",
    },
    stakes: "This is the tier's whole point: the trace is correct, the output is correct, and the code is still wrong. Correctness under sequential reading tells you nothing about correctness under concurrency. Read-modify-write on shared state needs the decision and the write to be a single atomic step, and the outside-world side effect should come after it, not inside it.",
  },
  bugs: [
    { tag: "race-condition", kind: "logic", what: "Read, check, then write using the captured value — two concurrent callers can both pass the check." },
    { tag: "premature-side-effect", kind: "logic", what: "The confirmation is sent before the seat count is actually decremented." },
  ],
},

{
  id: "t5-03", tier: 5,
  scenario: "Splitting an invoice across cost centres",
  ask: "Split the invoice evenly across the cost centres. The parts must add back up to the invoice total.",
  code: `def split_invoice(total, centres):
    share = round(total / len(centres), 2)
    return {c: share for c in centres}

parts = split_invoice(100.00, ["ops", "sales", "eng"])
print(parts)
print(sum(parts.values()))`,
  key: {
    trace: [
      "100.00 / 3 is 33.333..., rounded to 33.33.",
      "All three cost centres get that same 33.33.",
      "The sum of the three shares is 99.99.",
      "Prints the dict, then 99.99 — not 100.0.",
    ],
    runtime: { crashes: false, where: null, why: "Division, rounding and a dict comprehension. Nothing raises for this input." },
    logic: {
      matches: false,
      note: "The ask has two requirements and the code only satisfies the first. The split is even, but the parts do not add back up to the total — one øre is unallocated. Even division and exact reconciliation are in tension whenever the total does not divide cleanly, and something has to absorb the remainder.",
    },
    stakes: "The ledger will not balance, and it will not balance by an amount too small to notice per invoice and too persistent to ignore at month end. Money splits need a designated remainder holder: give the last centre `total - sum(the others)` so the parts reconcile by construction. Worth noting a second latent problem — an empty `centres` list would raise ZeroDivisionError, and nothing here guards it.",
  },
  bugs: [
    { tag: "missing-edge-case", kind: "logic", what: "Rounding each share independently means the parts do not sum to the total." },
  ],
},

{
  id: "t5-04", tier: 5,
  scenario: "Chasing unpaid invoices",
  ask: "Send one reminder to every customer who has an unpaid invoice more than 30 days old.",
  code: `def overdue_customers(invoices, today):
    out = []
    for inv in invoices:
        if inv["status"] == "unpaid" and today - inv["issued"] > 30:
            out.append(inv["customer"])
    return out

invs = [
    {"customer": "A", "status": "unpaid", "issued": 10},
    {"customer": "B", "status": "partial", "issued": 5},
    {"customer": "A", "status": "unpaid", "issued": 2},
]
print(overdue_customers(invs, 50))`,
  key: {
    trace: [
      "First invoice: status is 'unpaid' and 50 - 10 = 40, which is over 30. A is appended.",
      "Second: status is 'partial', so the first half of the `and` fails and B is skipped.",
      "Third: status is 'unpaid' and 50 - 2 = 48, over 30. A is appended a second time.",
      "Prints ['A', 'A'].",
    ],
    runtime: { crashes: false, where: null, why: "Every key is present and every value is the expected type. Nothing raises." },
    logic: {
      matches: false,
      note: "Two departures. The ask says one reminder per customer, and A appears twice because the function collects invoices rather than customers. And 'partial' is not 'unpaid' as far as this check is concerned, so a customer who paid a fraction of a large invoice 45 days ago is never chased at all — they are arguably the most overdue account in the list.",
    },
    stakes: "Customer A is emailed twice about being late, which is the kind of thing that costs goodwill for no gain. Customer B is never emailed, which costs money. Whenever a spec says 'unpaid', check what statuses actually exist in the data — the enum is nearly always wider than the sentence that describes it.",
  },
  bugs: [
    { tag: "missing-edge-case", kind: "logic", what: "'partial' invoices are outstanding but excluded by an exact match on 'unpaid'." },
    { tag: "not-idempotent", kind: "logic", what: "Customers with several overdue invoices are returned once per invoice, so they get several reminders." },
  ],
},

{
  id: "t5-05", tier: 5,
  scenario: "Flagging weekend transactions for review",
  ask: "Flag any transaction that happened on a weekend.",
  code: `from datetime import datetime

def is_weekend(ts):
    d = datetime.fromisoformat(ts)
    return d.weekday() > 5

for ts in ["2026-09-19T10:00:00", "2026-09-20T10:00:00", "2026-09-21T10:00:00"]:
    print(ts, is_weekend(ts))`,
  key: {
    trace: [
      "weekday() numbers the days from Monday = 0 through Sunday = 6.",
      "19 September 2026 is a Saturday, so weekday() is 5. `5 > 5` is False — it is not flagged.",
      "20 September is a Sunday, weekday() 6. `6 > 5` is True, so it is flagged.",
      "21 September is a Monday, weekday() 0, correctly not flagged.",
      "Prints False, True, False.",
    ],
    runtime: { crashes: false, where: null, why: "All three timestamps are valid ISO format, so fromisoformat parses them without complaint." },
    logic: {
      matches: false,
      note: "Only Sunday is ever flagged. Saturday sits exactly on the boundary that `> 5` excludes, so half the weekend goes unreviewed. The condition wanted is `>= 5`, or more readably `in (5, 6)`.",
    },
    stakes: "The output looks plausible — some transactions are flagged, some are not, and the function clearly does something. You only catch this by knowing that weekday() is zero-based with Monday first, or by checking the boundary case deliberately. Off-by-one in a comparison against a library's numbering is invisible unless you go and confirm the numbering.",
  },
  bugs: [
    { tag: "off-by-one", kind: "logic", what: "`> 5` excludes Saturday, which is weekday 5. Only Sunday is caught." },
  ],
},

{
  id: "t5-06", tier: 5,
  scenario: "Paginating search results",
  ask: "Return page 2, with 10 results per page.",
  code: `def page(results, page_num, per_page=10):
    start = page_num * per_page
    return results[start:start + per_page]

data = list(range(1, 36))
print(page(data, 2))`,
  key: {
    trace: [
      "data holds 1 through 35.",
      "start is 2 * 10 = 20, so the slice is results[20:30].",
      "Those positions hold the values 21 through 30.",
      "Prints [21, 22, ..., 30].",
    ],
    runtime: { crashes: false, where: null, why: "Slices never raise for being out of range, so even page 99 would return an empty list rather than an error." },
    logic: {
      matches: false,
      note: "The function treats page numbers as zero-based while the ask uses them the way people do, starting at 1. Asked for page 2 it returns the third page of results. Page 1 in the caller's numbering returns results 11-20, and results 1-10 are unreachable — no page number the caller would think to ask for returns them.",
    },
    stakes: "Ten records that nobody can ever see, and no error anywhere. Pagination bugs hide well because every page returned is a valid-looking page of real data. The tell is that the first page is wrong, and the first page is the one everybody tests by hand and assumes is fine.",
  },
  bugs: [
    { tag: "off-by-one", kind: "logic", what: "Zero-based page arithmetic against a one-based page number, so every page is shifted by one." },
  ],
},

{
  id: "t5-07", tier: 5,
  scenario: "Reporting average order value to the leadership dashboard",
  ask: "Report the average order value across completed orders only.",
  code: `def average_order_value(orders):
    total = 0
    for o in orders:
        if o["status"] == "completed":
            total += o["amount"]
    return round(total / len(orders), 2)

print(average_order_value([
    {"amount": 100, "status": "completed"},
    {"amount": 200, "status": "completed"},
    {"amount": 900, "status": "cancelled"},
]))`,
  key: {
    trace: [
      "The loop correctly adds only the completed orders: 100 + 200 = 300. The cancelled 900 is excluded.",
      "The division then uses len(orders), which is 3 — every order, including the cancelled one.",
      "300 / 3 = 100.0.",
      "Prints 100.0. The right answer is 150.0.",
    ],
    runtime: { crashes: false, where: null, why: "Nothing raises for this input. An empty list would give ZeroDivisionError, but that path is not exercised here." },
    logic: {
      matches: false,
      note: "The filter is applied to the numerator and not to the denominator. Cancelled orders are excluded from the sum but still counted in the divisor, so the average is dragged down by every order that was deliberately excluded.",
    },
    stakes: "The number that comes out is plausible — right order of magnitude, no obvious tell — so it will be believed, and it feeds pricing and forecasting. The more cancellations there are, the more wrong it gets, which means it degrades precisely when someone is looking at it to understand a bad month. Filter once, into a list, and take both the sum and the count from that.",
  },
  bugs: [
    { tag: "wrong-variable", kind: "logic", what: "The divisor counts all orders while the numerator counts only completed ones." },
  ],
},

{
  id: "t5-08", tier: 5,
  scenario: "Serving a public profile endpoint",
  ask: "Return the user's public profile: name and city.",
  code: `def public_profile(user):
    profile = user.copy()
    del profile["password_hash"]
    return profile

u = {
    "name": "Ana",
    "city": "Oslo",
    "password_hash": "abc123",
    "email": "ana@private.co",
    "internal_risk_score": 87,
}
print(public_profile(u))`,
  key: {
    trace: [
      "The user dict is copied, so the original is not modified — that part is careful.",
      "The password hash is deleted from the copy.",
      "Everything else is returned: name, city, email and internal_risk_score.",
      "Prints a dict containing the private email address and the internal risk score.",
    ],
    runtime: { crashes: false, where: null, why: "The key being deleted exists, so `del` succeeds. Nothing raises." },
    logic: {
      matches: false,
      note: "The ask names exactly two fields. The code instead removes the one field somebody thought of and returns everything else. It is a denylist where the ask describes an allowlist, and it is already leaking two fields today.",
    },
    stakes: "The dangerous property is what happens next: every column added to the user record from now on is public by default, on an endpoint nobody will revisit. Someone adds an internal note field a year from now and it is live on the public API the same day. Build the response from the fields you meant to expose — `{k: user[k] for k in ('name', 'city')}` — so new fields are private until a human says otherwise.",
  },
  bugs: [
    { tag: "overbroad-output", kind: "logic", what: "A denylist of one field where the ask specified exactly which two fields to return." },
  ],
},

{
  id: "t5-09", tier: 5,
  scenario: "Redeeming loyalty points against an order",
  ask: "Apply the customer's loyalty points to the order. Applying twice must not discount it twice.",
  code: `def redeem_points(order, customer):
    order["discount"] = customer["points"] * 0.5
    order["total"] = order["total"] - order["discount"]
    return order

o = {"id": "A", "total": 1000}
c = {"points": 100}
print(redeem_points(o, c))
print(redeem_points(o, c))`,
  key: {
    trace: [
      "First call: discount is 100 * 0.5 = 50.0, and total becomes 1000 - 50.0 = 950.0.",
      "The customer's points are never spent — they are still 100.",
      "Second call on the same order: discount is computed as 50.0 again, and total becomes 950.0 - 50.0 = 900.0.",
      "Prints a total of 950.0, then 900.0.",
    ],
    runtime: { crashes: false, where: null, why: "Arithmetic on keys that all exist. Calling it twice is perfectly legal as far as the interpreter is concerned." },
    logic: {
      matches: false,
      note: "The ask names idempotency as a requirement, and the function has nothing that would provide it. It neither deducts the points nor records that this order has already had them applied, so each call discounts the order again from its already-discounted total.",
    },
    stakes: "Retries are not exotic — a double-clicked button, a timeout that succeeded server-side and got retried, a queue redelivering a message. Any of them discounts the order twice while the customer's balance stays at 100 points, so the points can be spent again on the next order too. An operation that changes state needs to either record that it ran or be safe to run again; this does neither.",
  },
  bugs: [
    { tag: "not-idempotent", kind: "logic", what: "Nothing deducts the points or marks the order as already redeemed, so repeat calls stack." },
  ],
},

{
  id: "t5-10", tier: 5,
  scenario: "Blocking suspicious transactions",
  ask: "Block the transaction if the account is frozen, or if the amount is over the daily limit.",
  code: `def should_block(account, amount):
    return account["frozen"] or amount > account["daily_limit"] and account["verified"] is False

print(should_block({"frozen": False, "daily_limit": 1000, "verified": True}, 5000))
print(should_block({"frozen": True, "daily_limit": 1000, "verified": True}, 10))`,
  key: {
    trace: [
      "`and` binds more tightly than `or`, so the expression groups as: frozen OR (over_limit AND not_verified).",
      "First call: frozen is False. Then 5000 > 1000 is True, but `verified is False` is False, so the bracketed half is False.",
      "False or False is False — a 5000 transaction against a 1000 limit is allowed through.",
      "Second call: frozen is True, so `or` short-circuits and returns True immediately. Prints False, then True.",
    ],
    runtime: { crashes: false, where: null, why: "Boolean and comparison operators on present keys. Nothing raises." },
    logic: {
      matches: false,
      note: "The ask states two independent conditions joined by 'or'. The code adds a third clause nobody asked for and, through operator precedence, attaches it to the limit check — so the daily limit only applies to unverified accounts. The frozen check still works, which is exactly why this passes a quick test.",
    },
    stakes: "Verified accounts have no spending limit at all, and verified is the status most compromised accounts have. The limit exists for precisely this case and precedence quietly switched it off. When a boolean mixes `and` with `or`, add the brackets even where they are redundant — and read the condition back against the sentence in the spec, clause by clause.",
  },
  bugs: [
    { tag: "precedence", kind: "logic", what: "`and` binds tighter than `or`, so the limit check is gated behind the verification check." },
    { tag: "invented-rule", kind: "logic", what: "A `verified is False` condition that appears nowhere in the ask." },
  ],
},

]);
