// Tier 4 — Mixed bugs. At least one runtime defect and at least one logic /
// process-integrity defect in the same snippet. This is the realistic
// "an agent just handed you this" tier.
window.EXERCISES = (window.EXERCISES || []).concat([

{
  id: "t4-01", tier: 4,
  scenario: "Taking payment for a webshop order",
  ask: "Charge the customer the order total, mark the order paid, and send them a receipt.",
  code: `class Gateway:
    def charge(self, customer_id, amount):
        print("CHARGE", customer_id, amount)
        return {"status": "ok"}

def process_order(order, gateway, mailer_log):
    mailer_log.append("receipt sent to " + order["email"])
    fee = order["total"] * 0.029
    result = gateway.charge(order["customer_id"], order["total"] + fee)
    if result["status"] == "ok":
        order["paid"] = True
    return order

log = []
o = {"id": "A-1", "email": "ana@co", "customer_id": "C-9", "total": None}
print(process_order(o, Gateway(), log))
print(log)`,
  key: {
    trace: [
      "The receipt is recorded in mailer_log first, before anything has been charged.",
      "Then `order['total'] * 0.029` runs — and total is None.",
      "TypeError is raised. The gateway is never called, the order is never marked paid, and nothing is printed.",
      "The log entry claiming a receipt was sent is already there.",
    ],
    runtime: {
      crashes: true,
      where: "`fee = order[\"total\"] * 0.029`",
      why: "TypeError: unsupported operand type(s) for *: 'NoneType' and 'float'. The 'total' key exists, so no KeyError — its value is null.",
    },
    logic: {
      matches: false,
      note: "Two departures from the ask even before the crash. The receipt goes out before the charge is attempted, and a 2.9% fee is added to the amount charged — the ask said charge the order total, full stop.",
    },
    stakes: "The customer is told they have been charged when they have not, and had the total been a real number they would have been overcharged by 2.9% under a fee nobody approved. The ordering is the deeper problem: a side effect that reaches the outside world should never precede the state that makes it true.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A null total flows straight into arithmetic with no validation." },
    { tag: "premature-side-effect", kind: "logic", what: "The receipt is recorded before the charge is even attempted, let alone confirmed." },
    { tag: "invented-rule", kind: "logic", what: "A 2.9% fee is added to the charged amount, and the ask never mentions a fee." },
  ],
},

{
  id: "t4-02", tier: 4,
  scenario: "Moving stock between two warehouses",
  ask: "Move the given quantity from one warehouse to the other. Both sides must end up consistent.",
  code: `CAPACITY = 500
audit = []

def transfer(stock, sku, qty, src, dst):
    stock[src][sku] -= qty
    audit.append("moved " + qty + " units of " + sku)
    if stock[dst][sku] + qty > CAPACITY:
        raise ValueError("destination over capacity")
    stock[dst][sku] += qty
    return stock

stock = {"A": {"widget": 100}, "B": {"widget": 480}}
print(transfer(stock, "widget", 40, "A", "B"))
print(stock, audit)`,
  key: {
    trace: [
      "Warehouse A is decremented first: 100 becomes 60. The source is now short 40 units.",
      "The audit line then builds `\"moved \" + qty` where qty is the integer 40.",
      "TypeError is raised there. Nothing is printed, and the 40 units are simply gone from A without arriving anywhere.",
      "Had that line been correct, the run would still have failed: B holds 480, and 480 + 40 = 520 exceeds the 500 capacity, so the ValueError would fire — again after A had already been decremented.",
    ],
    runtime: {
      crashes: true,
      where: "`audit.append(\"moved \" + qty + ...)`",
      why: "TypeError: can only concatenate str (not \"int\") to str. qty is a number being concatenated onto a string.",
    },
    logic: {
      matches: false,
      note: "The ask says both sides must end consistent, and no path through this function guarantees that. The capacity check runs after the source has already been debited, and nothing restores it when the check fails. There is also no check that A has enough stock to give — pass a large enough qty and it goes negative without complaint.",
    },
    stakes: "Inventory is destroyed rather than moved, and the audit trail does not record it because the audit line is what crashed. Validate before you mutate, and when a sequence of writes has to succeed together, either wrap it in a transaction or be explicit about how you undo the first half.",
  },
  bugs: [
    { tag: "type-mismatch", kind: "runtime", what: "An integer quantity concatenated onto a string in the audit message." },
    { tag: "wrong-order", kind: "logic", what: "The capacity check runs after the source warehouse has already been debited." },
    { tag: "no-rollback", kind: "logic", what: "When the second half fails, nothing reverses the first half." },
    { tag: "missing-edge-case", kind: "logic", what: "No check that the source holds enough stock, so the balance can go negative." },
  ],
},

{
  id: "t4-03", tier: 4,
  scenario: "Pricing an order at checkout",
  ask: "Apply exactly one discount: the best single one the customer qualifies for.",
  code: `PROMOS = {"SAVE20": 0.20}

def final_price(price, customer):
    discount = 0
    if customer["member"]:
        discount += 0.10
    if customer["orders"] > 10:
        discount += 0.05
    try:
        discount += PROMOS[customer["promo"]]
    except:
        pass
    return round(price * (1 - discount), 2)

print(final_price(1000, {"member": True, "orders": 12, "promo": "SAVE20"}))
print(final_price(1000, {"orders": 3, "promo": "NONE"}))`,
  key: {
    trace: [
      "First customer: member adds 0.10, more than 10 orders adds 0.05, and the SAVE20 promo adds 0.20.",
      "Those accumulate to 0.35, so the price becomes 1000 * 0.65 = 650.0. Printed.",
      "Second customer has no 'member' key at all.",
      "`customer['member']` raises KeyError — and it sits outside the try block, so nothing catches it.",
    ],
    runtime: {
      crashes: true,
      where: "`if customer[\"member\"]` on the second call",
      why: "KeyError: 'member'. Worth noting where the try block starts: it wraps only the promo lookup, so the two earlier dict accesses are unprotected.",
    },
    logic: {
      matches: false,
      note: "The ask is explicit — exactly one discount, the best one. This adds all three together. A customer who qualifies three ways gets 35% off instead of 20%. Separately, the bare `except: pass` silently absorbs a bad promo code, so a typo in a campaign code produces a full-price order with no error anywhere.",
    },
    stakes: "Stacking is the expensive half: the margin on every multi-qualifying customer is wrong, and revenue reports will not show it as a bug — just as lower revenue. A bare except is the other half; it catches everything, including mistakes you have not made yet, and turns them into silence.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "Required customer keys accessed with square brackets and no default." },
    { tag: "invented-rule", kind: "logic", what: "Discounts accumulate, where the ask specified exactly one." },
    { tag: "swallowed-error", kind: "logic", what: "A bare `except: pass` hides an invalid promo code and anything else that goes wrong in that block." },
  ],
},

{
  id: "t4-04", tier: 4,
  scenario: "Deleting a user account on request",
  ask: "Remove the user's sessions first, then the account itself, and log the deletion only once both have succeeded.",
  code: `def delete_user(user_id, users, sessions, audit):
    audit.append("deleted user " + user_id)
    users.pop(user_id)
    for i in range(len(sessions)):
        if sessions[i]["user"] == user_id:
            sessions.pop(i)
    return True

users = {"u1": {"name": "Ana"}, "u2": {"name": "Bo"}}
sessions = [{"user": "u1"}, {"user": "u1"}, {"user": "u2"}]
audit = []
print(delete_user("u1", users, sessions, audit))
print(sessions, audit)`,
  key: {
    trace: [
      "The audit entry is written first, before any deletion has happened.",
      "The account is popped from users, leaving only u2.",
      "range(len(sessions)) was fixed at 3 before the loop began. i = 0 matches u1 and pops it, leaving two sessions.",
      "i = 1 is now the u2 session — the second u1 session slid down into index 0, which the loop has already passed. It survives.",
      "i = 2 is beyond the two remaining items. IndexError.",
    ],
    runtime: {
      crashes: true,
      where: "`sessions[i][\"user\"]` when i reaches 2",
      why: "IndexError: list index out of range. The loop bound was computed from the original length and never updated as the list shrank.",
    },
    logic: {
      matches: false,
      note: "Three separate departures from the ask. The order is reversed — the account goes before the sessions. The audit line claims success before any work is done, and it stands even though the function crashed. And one of the user's two sessions is never removed at all, because popping shifts the later items past the loop's cursor.",
    },
    stakes: "A live session belonging to a deleted account is an authentication token with no account behind it to check against — the exact shape of a real access-control failure. Meanwhile the audit log says the deletion completed. For a deletion request under GDPR, a log that says done and a system that did not is the worst of both.",
  },
  bugs: [
    { tag: "mutate-while-iterating", kind: "runtime", what: "Items popped from the sessions list while iterating it over a pre-computed index range." },
    { tag: "wrong-order", kind: "logic", what: "The account is deleted before its sessions, the reverse of what the ask specifies." },
    { tag: "premature-side-effect", kind: "logic", what: "The audit entry is written before the work, and records success for a run that failed." },
    { tag: "missing-edge-case", kind: "logic", what: "A user with two sessions keeps one — the filter silently skips every item following a removal." },
  ],
},

{
  id: "t4-05", tier: 4,
  scenario: "Booking a clinic appointment",
  ask: "Book the requested slot if it is free. Do not alter the time the patient asked for.",
  code: `def notify(patient):
    print("SMS to " + patient["phone"])

def book(slot, calendar):
    if slot["start"] < 9:
        slot["start"] = 9
    key = str(slot["start"])
    if key in calendar:
        return "conflict"
    calendar[key] = slot["patient"]
    notify(slot["patient"])
    return "booked"

cal = {}
print(book({"start": 7, "patient": {"name": "Ida", "phone": None}}, cal))
print(cal)`,
  key: {
    trace: [
      "The requested start is 7, which is under 9, so the code silently rewrites it to 9.",
      "The calendar is empty, so there is no conflict, and the slot is written into it under key '9'.",
      "notify is then called, and the patient's phone is None.",
      "`\"SMS to \" + None` raises TypeError. Nothing is printed — but the calendar entry is already committed.",
    ],
    runtime: {
      crashes: true,
      where: "`\"SMS to \" + patient[\"phone\"]` inside notify",
      why: "TypeError: can only concatenate str (not \"NoneType\") to str. The phone key exists and holds null.",
    },
    logic: {
      matches: false,
      note: "The ask says explicitly not to alter the requested time, and the first two lines of the function do exactly that — moving a 7am request to 9am with no error, no flag and nothing returned to say it happened. The caller is told 'booked' for a slot the patient never asked for.",
    },
    stakes: "A patient turns up at 7 for an appointment the system moved to 9, and the SMS that would have told them never sent because the function died after writing the booking. The calendar and the outside world now disagree, and nothing in the return value hints at it. Silently correcting input is a business decision disguised as a guard clause.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A null phone number concatenated into the notification text." },
    { tag: "invented-rule", kind: "logic", what: "Requests before 9am are silently moved to 9am, directly against the ask." },
    { tag: "no-rollback", kind: "logic", what: "The calendar write survives the failed notification, leaving a booking nobody was told about." },
  ],
},

{
  id: "t4-06", tier: 4,
  scenario: "Importing a product catalogue from a supplier file",
  ask: "Import the rows, skip any that are malformed, and report how many made it in.",
  code: `def import_rows(rows, db):
    imported = 0
    for row in rows:
        try:
            db.append({"sku": row[0], "qty": int(row[1]), "price": float(row[2])})
            imported += 1
        except:
            continue
    print("Imported " + imported + " rows")
    return db

db = []
print(import_rows([["A1", "5", "9.99"], ["B2", "x", "3.00"], ["C3", "2"]], db))`,
  key: {
    trace: [
      "Row A1 converts cleanly and is appended. imported becomes 1.",
      "Row B2 has qty 'x', so int('x') raises ValueError. The bare except catches it and continues.",
      "Row C3 has only two fields, so row[2] raises IndexError. Also caught, also skipped.",
      "After the loop, `\"Imported \" + imported` concatenates a string and the integer 1. TypeError.",
    ],
    runtime: {
      crashes: true,
      where: "`print(\"Imported \" + imported + \" rows\")`",
      why: "TypeError: can only concatenate str (not \"int\") to str. The count needs str() around it, or an f-string.",
    },
    logic: {
      matches: false,
      note: "The ask has three parts and the third never happens, because the line that reports the count is the line that crashes. The skipping works, but a bare `except` skips on *any* exception — including a misspelled variable or a bug introduced later — so genuine defects will present as quietly missing rows.",
    },
    stakes: "Silent partial imports are among the hardest failures to notice, because the system keeps working with less data than it should have. Nothing anywhere records which rows were dropped or why. Catch the specific exceptions you expect, and log what you skipped.",
  },
  bugs: [
    { tag: "type-mismatch", kind: "runtime", what: "An integer count concatenated onto strings in the report line." },
    { tag: "swallowed-error", kind: "logic", what: "A bare `except: continue` discards every exception with no record of what failed." },
    { tag: "missing-edge-case", kind: "logic", what: "The ask's requirement to report the import count is never delivered." },
  ],
},

{
  id: "t4-07", tier: 4,
  scenario: "Changing a user's role in an admin panel",
  ask: "Only an admin may change a role. Check that first, then apply the change.",
  code: `def change_role(actor, target, new_role, audit):
    target["role"] = new_role
    audit.append(actor["name"] + " set " + target["name"] + " to " + new_role)
    if actor["role"] != "admin":
        return "denied"
    return "ok"

audit = []
t = {"name": "Bo", "role": "viewer"}
print(change_role({"name": "Eve", "role": "viewer"}, t, "admin", audit))
print(t)
print(change_role({"name": "Mal"}, t, "admin", audit))`,
  key: {
    trace: [
      "First call: Bo's role is immediately set to 'admin' — before anyone has checked whether Eve is allowed to do that.",
      "The audit entry is written as though the change were authorised.",
      "Only then is Eve's own role checked. She is a viewer, so the function returns 'denied'.",
      "But nothing undoes the change. The next print shows Bo with role 'admin'. 'denied' was returned and the escalation stands.",
      "Second call: Bo is set to admin again and audited again, then `actor['role']` raises KeyError because Mal has no role key.",
    ],
    runtime: {
      crashes: true,
      where: "`if actor[\"role\"] != \"admin\"` on the third call",
      why: "KeyError: 'role'. An actor object without that key reaches the check — and by then the mutation has already happened.",
    },
    logic: {
      matches: false,
      note: "The ask could not be more explicit about order: check first, then apply. This applies first and checks afterwards, and the check has no power to undo anything. Returning 'denied' while the change persists is worse than either allowing or blocking it cleanly, because every caller and every log reader will believe nothing happened.",
    },
    stakes: "This is privilege escalation available to any authenticated user — call the endpoint, receive 'denied', be an admin. The audit trail actively works against you here, recording the change as a normal authorised action. Authorisation checks belong before the first write, not after the last one.",
  },
  bugs: [
    { tag: "wrong-order", kind: "logic", what: "The role is written before the caller's authority to write it is checked." },
    { tag: "missing-none-check", kind: "runtime", what: "`actor['role']` assumes a key that the second caller does not have." },
    { tag: "no-rollback", kind: "logic", what: "Returning 'denied' leaves the unauthorised mutation in place." },
    { tag: "premature-side-effect", kind: "logic", what: "The audit entry is written before authorisation and describes the change as legitimate." },
  ],
},

{
  id: "t4-08", tier: 4,
  scenario: "Fetching orders from a flaky internal API",
  ask: "Try the call up to three times. If it still fails, give up and raise.",
  code: `class Client:
    def __init__(self):
        self.calls = 0
    def get(self, url):
        self.calls += 1
        raise ConnectionError("timeout")

def fetch_with_retry(client, url):
    attempts = 0
    while attempts < 3:
        try:
            return client.get(url)
        except Exception:
            attempts += 1
    return None

c = Client()
result = fetch_with_retry(c, "/orders")
print("calls:", c.calls)
print("fetched " + str(len(result)) + " orders")`,
  key: {
    trace: [
      "The loop runs while attempts is under 3, and the client raises every time, so attempts goes 1, 2, 3.",
      "After the third failure the condition is false and the loop exits.",
      "The function returns None. 'calls: 3' is printed, confirming the retry count is right.",
      "Then len(None) is evaluated. TypeError.",
    ],
    runtime: {
      crashes: true,
      where: "`len(result)` where result is None",
      why: "TypeError: object of type 'NoneType' has no len(). The crash lands in the caller, some distance from the function that decided to return None.",
    },
    logic: {
      matches: false,
      note: "The retry count is correct — three attempts, as asked. What it does after giving up is not: the ask says raise, and it returns None instead. That makes total failure look like an ordinary result, and the caller has no way to tell 'the API is down' from 'there were no orders'. The exception is also discarded entirely, so the reason for failure is lost.",
    },
    stakes: "Returning None where the contract says raise is how an outage becomes a data problem. Downstream code sees an empty-ish result, writes it somewhere, and by the time anyone notices the orders are missing the connection to the failed fetch is long gone. Here it happens to crash immediately, which is the kindest possible version — a caller doing `for o in result or []` would have carried on silently.",
    },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "The caller uses the return value without checking it against None." },
    { tag: "swallowed-error", kind: "logic", what: "The caught exception is discarded — no re-raise, no log, no reason recorded." },
    { tag: "missing-edge-case", kind: "logic", what: "The ask says raise after giving up; it returns None, making failure indistinguishable from an empty result." },
  ],
},

{
  id: "t4-09", tier: 4,
  scenario: "Refunding a cancelled order",
  ask: "Refund the full order amount and mark the order refunded.",
  code: `def refund(order, ledger):
    amount = order["total"] * 0.95
    ledger.append({"order": order["id"], "refund": amount})
    order["status"] = "refunded"
    if order["total"] > 10000:
        ledger.append({"order": order["id"], "approver": order["approved_by"]})
    return amount

ledger = []
o = {"id": "O-7", "total": 12000, "status": "paid"}
print(refund(o, ledger))
print(o, ledger)`,
  key: {
    trace: [
      "The refund amount is computed as 12000 * 0.95 = 11400.0 — 5% short of the total.",
      "That amount is written to the ledger, and the order status is set to 'refunded'.",
      "The total is over 10000, so the approver branch runs and reads order['approved_by'].",
      "That key does not exist. KeyError. Nothing is printed, and both the ledger entry and the status change remain.",
    ],
    runtime: {
      crashes: true,
      where: "`order[\"approved_by\"]` in the high-value branch",
      why: "KeyError: 'approved_by'. Only orders over 10000 reach this line, so every smaller refund runs clean and this stays hidden until a large one comes through.",
    },
    logic: {
      matches: false,
      note: "The ask says refund the full amount. The code withholds 5% under a rule that appears nowhere in the ask, and there is no rollback — when the approver lookup fails, the order is already marked refunded and the ledger already has an entry for the wrong amount.",
    },
    stakes: "The customer is short-changed by 5% on every refund, and the order that crashed is now in a state no process will revisit: marked refunded, ledgered at the wrong figure, with no approval record. The fact that only large refunds crash makes it worse — the silent 5% has been running correctly-looking for every small refund since the day it shipped.",
  },
  bugs: [
    { tag: "invented-rule", kind: "logic", what: "5% is withheld from every refund, and the ask said refund the full amount." },
    { tag: "missing-none-check", kind: "runtime", what: "`approved_by` is read without checking it is present." },
    { tag: "no-rollback", kind: "logic", what: "The ledger write and status change survive the crash, leaving the order inconsistent." },
  ],
},

{
  id: "t4-10", tier: 4,
  scenario: "Paging on-call subscribers about an incident",
  ask: "Send one alert per subscriber for this incident, and return the list of who was notified.",
  code: `def alert(incident, subscribers, sent=[]):
    for s in subscribers:
        sent.append(s["email"])
        print("ALERT to " + s["email"] + ": " + incident["summary"])
    return sent

subs_a = [{"email": "a@co"}, {"email": "b@co"}]
subs_b = [{"email": "c@co"}, {"email": None}]
print(alert({"summary": "DB down"}, subs_a))
print(alert({"summary": "DB back up"}, subs_b))`,
  key: {
    trace: [
      "First call: a@co and b@co are each appended and alerted. Returns ['a@co', 'b@co'].",
      "Second call omits the list argument too, so it reuses the same default list object — which already holds the first incident's recipients.",
      "c@co is appended, making ['a@co', 'b@co', 'c@co'], and alerted.",
      "The next subscriber has a None email. It is appended to the list first, then the concatenation raises TypeError.",
    ],
    runtime: {
      crashes: true,
      where: "`\"ALERT to \" + s[\"email\"]` for the subscriber with a null email",
      why: "TypeError: can only concatenate str (not \"NoneType\") to str. Note the append happened before the send, so the list records a recipient that was never contacted.",
    },
    logic: {
      matches: false,
      note: "The ask says return who was notified for this incident. The second call returns everyone from the first incident as well, because the default list persists between calls. And each address is recorded as notified before the alert actually goes out, so the record overstates delivery even when nothing crashes.",
    },
    stakes: "During an incident this reads as 'a@co and b@co were paged about the outage recovery' when they were not, and 'the null-email subscriber was notified' when the send failed. An on-call notification record that overstates delivery is worse than no record — it stops someone picking up the phone.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A null email address concatenated into the alert text." },
    { tag: "mutable-default-arg", kind: "runtime", what: "`sent=[]` persists across calls, so each incident inherits the previous one's recipients." },
    { tag: "premature-side-effect", kind: "logic", what: "Each recipient is recorded as notified before the alert is actually sent." },
  ],
},

]);
