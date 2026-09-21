// Tier 3 — Single bug, real-world framing.
// Same defect classes as Tier 2, now embedded in a business process so the
// "why does this matter" reasoning gets exercised alongside the technical spot.
window.EXERCISES = (window.EXERCISES || []).concat([

{
  id: "t3-01", tier: 3,
  scenario: "Weekly payroll run for hourly staff",
  ask: "Pay the normal rate up to 40 hours and 1.5x for everything above that.",
  code: `def weekly_pay(employee, rate):
    hours = employee.get("hours_logged")
    if hours > 40:
        return 40 * rate + (hours - 40) * rate * 1.5
    return hours * rate

staff = [
    {"name": "Ida", "hours_logged": 45},
    {"name": "Per", "hours_logged": 38},
    {"name": "Nils"},
]
for s in staff:
    print(s["name"], weekly_pay(s, 250))`,
  key: {
    trace: [
      "Ida logged 45 hours: 40 * 250 = 10000, plus 5 overtime hours at 375 each = 1875. Prints Ida 11875.0.",
      "Per logged 38 hours, which is not over 40, so 38 * 250 = 9500. Prints Per 9500.",
      "Nils has no 'hours_logged' key at all, so .get returns None.",
      "`None > 40` raises TypeError. The payroll loop stops on the third employee.",
    ],
    runtime: {
      crashes: true,
      where: "`if hours > 40` for the employee with no logged hours",
      why: "TypeError: '>' not supported between instances of 'NoneType' and 'int'. The missing key is silently tolerated by .get(); the comparison is where it surfaces.",
    },
    logic: { matches: false, note: "The overtime calculation is exactly right. What is missing is a decision about what an employee with no logged hours should be paid — arguably zero, arguably an error, but certainly not a crash." },
    stakes: "Payroll halts partway through. Ida and Per were paid, Nils and everyone after him were not, and the run reports failure rather than a list of who was and was not processed. Re-running it naively pays Ida and Per twice.",
  },
  bugs: [
    { tag: "none-vs-zero", kind: "runtime", what: "A missing timesheet yields None, which is then used in a numeric comparison." },
    { tag: "missing-none-check", kind: "runtime", what: "No guard between `.get()` and the arithmetic that depends on its result." },
  ],
},

{
  id: "t3-02", tier: 3,
  scenario: "Order history panel in a customer account page",
  ask: "Show the customer's three most recent orders, newest first.",
  code: `def recent_order_ids(orders, n=3):
    ordered = sorted(orders, key=lambda o: o["date"], reverse=True)
    ids = []
    for i in range(n):
        ids.append(ordered[i]["id"])
    return ids

print(recent_order_ids([{"id": "X1", "date": 3}, {"id": "X2", "date": 7}]))`,
  key: {
    trace: [
      "The two orders sort newest-first to [X2 (date 7), X1 (date 3)].",
      "The loop runs range(3), so i = 0, 1, 2 regardless of how many orders exist.",
      "i = 0 appends X2, i = 1 appends X1 — both correct.",
      "i = 2 indexes past the end of a two-item list. IndexError.",
    ],
    runtime: {
      crashes: true,
      where: "`ordered[i][\"id\"]` when i reaches 2",
      why: "IndexError: list index out of range. The loop is driven by the requested count, not by how many orders there actually are.",
    },
    logic: { matches: false, note: "The sort is right and the newest-first ordering is right. It assumes every customer has at least three orders." },
    stakes: "Every brand-new customer — precisely the ones most likely to be nervous about their first order — gets an error page instead of an order history. Long-standing customers see nothing wrong, so this survives internal testing by anyone with a real account.",
  },
  bugs: [
    { tag: "off-by-one", kind: "runtime", what: "Iterating a fixed count instead of the actual length; `ordered[:n]` would have been safe." },
  ],
},

{
  id: "t3-03", tier: 3,
  scenario: "Generating an invoice from imported timesheet lines",
  ask: "Add 25% VAT to each line and return the invoice total.",
  code: `def invoice_total(lines):
    total = 0
    for line in lines:
        total += line["amount"] * 1.25
    return round(total, 2)

rows = [
    {"desc": "Consulting", "amount": 1200},
    {"desc": "Travel", "amount": "450"},
]
print(invoice_total(rows))`,
  key: {
    trace: [
      "First line: 1200 * 1.25 = 1500.0, so total is 1500.0.",
      "Second line's amount is the string '450', not a number — it came through the import as text.",
      "'450' * 1.25 asks Python to repeat a string a fractional number of times.",
      "TypeError is raised. The invoice is never produced.",
    ],
    runtime: {
      crashes: true,
      where: "`line[\"amount\"] * 1.25` on the Travel line",
      why: "TypeError: can't multiply sequence by non-int of type 'float'. Multiplying a string by an *integer* is legal in Python and repeats it; multiplying by a float is not.",
    },
    logic: { matches: false, note: "The VAT rate and the totalling are correct. Nothing validates or converts the amounts coming in from the import." },
    stakes: "Invoicing dies on any batch containing one text-typed amount, and the row that caused it is not named in the error. Note the near miss: had the multiplier been 2 rather than 1.25, '450' * 2 would have produced '450450' and the invoice would have gone out with a nonsense total instead of failing.",
  },
  bugs: [
    { tag: "type-mismatch", kind: "runtime", what: "Imported values assumed numeric, with no coercion or validation at the boundary." },
  ],
},

{
  id: "t3-04", tier: 3,
  scenario: "Provisioning tasks for a new hire",
  ask: "Return the standard onboarding tasks for a new hire, plus any extras their role needs.",
  code: `def onboarding_tasks(role, tasks=["laptop", "badge", "handbook"]):
    if role == "engineer":
        tasks.append("repo access")
    if role == "sales":
        tasks.append("crm seat")
    return tasks

print(onboarding_tasks("engineer"))
print(onboarding_tasks("sales"))
print(onboarding_tasks("support"))`,
  key: {
    trace: [
      "The default list is built once when the function is defined, and every call that omits the argument gets that same list object.",
      "The engineer call appends 'repo access' to it. Prints laptop, badge, handbook, repo access.",
      "The sales call reuses the now-four-item list and appends 'crm seat'. Prints all five.",
      "The support call appends nothing of its own — but returns the same accumulated list, still carrying repo access and crm seat.",
    ],
    runtime: {
      crashes: false,
      where: null,
      why: "Nothing raises. Appending to a list is always legal, so the interpreter has no objection at any point.",
    },
    logic: {
      matches: false,
      note: "The ask says each hire gets the standard tasks plus their own role's extras. From the second call onward, every hire also inherits every previous hire's extras.",
    },
    stakes: "The support hire is provisioned repo access and a CRM seat they were never meant to have. This is a mutable-default bug wearing an access-control costume — it grants standing permissions to the wrong people, silently, and gets worse with every hire.",
  },
  bugs: [
    { tag: "mutable-default-arg", kind: "runtime", what: "A list literal as a default parameter, mutated in place on every call." },
  ],
},

{
  id: "t3-05", tier: 3,
  scenario: "Routing a purchase request for approval",
  ask: "Send requests over 5000 to the director, and everything else to the manager.",
  code: `def route_request(request, manager, director):
    amount = request["amount"]
    if amount > 5000:
        approver = director
    else:
        approver = manager
    return {"request_id": request["id"], "approver": aprover}

print(route_request({"id": "REQ-9", "amount": 12000}, "bo@co", "ida@co"))`,
  key: {
    trace: [
      "amount is 12000, which is over 5000, so `approver` is set to the director.",
      "The branching is entirely correct and the right person is selected.",
      "The return statement then refers to `aprover` — missing the second p — which was never assigned.",
      "NameError is raised. This happens on every call, whichever branch was taken.",
    ],
    runtime: {
      crashes: true,
      where: "`return {..., \"approver\": aprover}`",
      why: "NameError: name 'aprover' is not defined. Python only resolves the name when the line runs, so the typo sits there undetected until execution reaches it.",
    },
    logic: { matches: false, note: "The routing rule matches the ask precisely. The function never manages to hand back the answer it correctly computed." },
    stakes: "Nothing routes at all, for any amount — so this one is caught the first time anybody tries it. That is the good case. Compare it with the shadowing exercise in Tier 2, where a wrong name resolved to a real object and the code ran on happily with the wrong answer.",
  },
  bugs: [
    { tag: "wrong-variable", kind: "runtime", what: "A misspelled name in the return, referring to nothing that exists." },
  ],
},

{
  id: "t3-06", tier: 3,
  scenario: "Rendering the customer list in a CRM",
  ask: "Build a display name from each customer record.",
  code: `def display_name(customer):
    first = customer["first_name"]
    last = customer["last_name"]
    return (first + " " + last).strip()

records = [
    {"first_name": "Ana", "last_name": "Ruiz"},
    {"first_name": "Bo", "last_name": None},
]
for r in records:
    print(display_name(r))`,
  key: {
    trace: [
      "First record: 'Ana' + ' ' + 'Ruiz' gives 'Ana Ruiz', and .strip() leaves it alone. Printed.",
      "Second record: both keys exist, so neither lookup raises — but last_name holds None.",
      "'Bo ' + None asks Python to concatenate a str and a NoneType.",
      "TypeError is raised. The list rendering stops on the second row.",
    ],
    runtime: {
      crashes: true,
      where: "`first + \" \" + last` on the second record",
      why: "TypeError: can only concatenate str (not \"NoneType\") to str. Both keys are present, which is why a `if 'last_name' in customer` style check would not have saved this — the key exists and its value is null.",
    },
    logic: { matches: false, note: "The formatting, including the .strip() that would tidy a trailing space, is right. It assumes a name that is present is also non-null." },
    stakes: "One incomplete record takes down the entire customer list view, not just its own row. A key existing and a key holding a usable value are different guarantees, and database columns that allow NULL hand you the second case constantly.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A present-but-null field used in string concatenation without a fallback." },
  ],
},

{
  id: "t3-07", tier: 3,
  scenario: "Summarising sensor readings for a maintenance dashboard",
  ask: "Report the maximum, the average, and the spread of a batch of readings.",
  code: `def summarise(readings):
    max = 0
    for r in readings:
        if r > max:
            max = r
    count = len(readings)
    avg = sum(readings) / count
    return {"max": max, "avg": round(avg, 1), "range": max(readings) - min(readings)}

print(summarise([12, 45, 7, 30]))`,
  key: {
    trace: [
      "The local name `max` is assigned 0, which shadows Python's built-in max function inside this scope.",
      "The loop works correctly and leaves `max` holding 45.",
      "count is 4 and avg is 94 / 4 = 23.5, both fine.",
      "The return line then calls max(readings) — but `max` is now the integer 45, and integers are not callable. TypeError.",
    ],
    runtime: {
      crashes: true,
      where: "`max(readings)` in the return statement",
      why: "TypeError: 'int' object is not callable. Assigning to `max` replaced the built-in for the rest of the function, so the later call tries to invoke a number.",
    },
    logic: { matches: false, note: "All three statistics are the right ones to compute, and two of them are computed correctly before the crash." },
    stakes: "Shadowing a built-in is legal Python, so nothing warns you. The failure lands on a line that looks obviously correct in isolation — which is why reading it top to bottom, tracking what each name currently refers to, is the only way to catch it.",
  },
  bugs: [
    { tag: "wrong-variable", kind: "runtime", what: "A local variable named `max` shadows the built-in, which is then called later in the same scope." },
  ],
},

{
  id: "t3-08", tier: 3,
  scenario: "Showing a loan's repayment schedule",
  ask: "Show the balance after each of the twelve monthly payments, and return the final one.",
  code: `def running_balance(principal, payment):
    balances = []
    balance = principal
    for month in range(1, 13):
        balance -= payment
        balances.append(balance)
    return balances[12]

print(running_balance(12000, 1000))`,
  key: {
    trace: [
      "range(1, 13) gives months 1 through 12, so the loop body runs exactly twelve times.",
      "Each pass subtracts 1000 and appends, so balances ends up with twelve entries: 11000 down to 0.",
      "Twelve items occupy indices 0 through 11. There is no index 12.",
      "`balances[12]` raises IndexError right at the end, after all the correct work is done.",
    ],
    runtime: {
      crashes: true,
      where: "`return balances[12]`",
      why: "IndexError: list index out of range. Twelve iterations produce twelve entries, and the last one is at index 11 — `balances[-1]` is the expression that means 'the last one'.",
    },
    logic: { matches: false, note: "The schedule itself is built correctly. The bug is purely in retrieving the final entry." },
    stakes: "The month number and the list index are off by one from each other because the loop counts from 1 and the list counts from 0. Any time a loop counter is shifted for display purposes, the indices it feeds need checking separately.",
  },
  bugs: [
    { tag: "off-by-one", kind: "runtime", what: "Indexing with the iteration count rather than count minus one." },
  ],
},

{
  id: "t3-09", tier: 3,
  scenario: "Applying a customer's credit limit at checkout",
  ask: "Use the customer's stored credit limit. Fall back to the default only when no limit has been set.",
  code: `DEFAULT_LIMIT = 5000

def credit_limit(customer):
    limit = customer.get("credit_limit") or DEFAULT_LIMIT
    return limit

print(credit_limit({"id": 1, "credit_limit": 20000}))
print(credit_limit({"id": 2}))
print(credit_limit({"id": 3, "credit_limit": 0}))`,
  key: {
    trace: [
      "Customer 1 has a limit of 20000, which is truthy, so `or` short-circuits and returns it. Prints 20000.",
      "Customer 2 has no key, so .get returns None, which is falsy, so the default is used. Prints 5000 — correct.",
      "Customer 3 has a limit that is explicitly set to 0.",
      "0 is falsy, so `or` discards it and returns the default. Prints 5000.",
    ],
    runtime: {
      crashes: false,
      where: null,
      why: "Nothing raises. `or` accepts any operand types, and every branch returns a number.",
    },
    logic: {
      matches: false,
      note: "The ask says fall back only when no limit has been set. Customer 3 has a limit set — to zero — and the code cannot tell that apart from absent, because `or` tests truthiness rather than presence.",
    },
    stakes: "A customer deliberately frozen at a zero credit limit is silently granted a 5000 line of credit. Someone made a decision, recorded it correctly, and the code overruled it. The fix is to test for absence explicitly: `customer.get('credit_limit')` compared against None, not evaluated for truth.",
  },
  bugs: [
    { tag: "none-vs-zero", kind: "runtime", what: "`or` used for defaulting, which cannot distinguish a legitimate 0 from a missing value." },
  ],
},

{
  id: "t3-10", tier: 3,
  scenario: "Closing out a batch of expense claims",
  ask: "Remove every claim that has already been reimbursed.",
  code: `def drop_reimbursed(claims):
    for i in range(len(claims)):
        if claims[i]["status"] == "reimbursed":
            claims.pop(i)
    return claims

batch = [
    {"id": "C1", "status": "reimbursed"},
    {"id": "C2", "status": "reimbursed"},
    {"id": "C3", "status": "pending"},
]
print(drop_reimbursed(batch))`,
  key: {
    trace: [
      "range(len(claims)) is evaluated once at the start, with len 3, so i will run 0, 1, 2 no matter what happens to the list.",
      "i = 0: C1 is reimbursed, so it is popped. The list is now [C2, C3] and has length 2.",
      "i = 1: that is now C3, which is pending, so nothing happens — C2 was skipped entirely, because popping shifted it into the slot the loop had already passed.",
      "i = 2: the list only has indices 0 and 1 left. IndexError.",
    ],
    runtime: {
      crashes: true,
      where: "`claims[i][\"status\"]` when i reaches 2",
      why: "IndexError: list index out of range. The range was fixed at the original length while the list shrank underneath it.",
    },
    logic: { matches: false, note: "Even setting the crash aside, C2 would have survived the filter despite being reimbursed — removing an item moves every later item down one, so the loop steps straight over its neighbour." },
    stakes: "Two failures for the price of one, and they mask each other: the crash is what you notice, while the silently skipped claim is the one that costs money. Build a new list instead of mutating the one you are walking.",
  },
  bugs: [
    { tag: "mutate-while-iterating", kind: "runtime", what: "Items removed from a list while iterating it by a pre-computed index range." },
    { tag: "off-by-one", kind: "runtime", what: "The loop bound is stale the moment the first element is popped." },
  ],
},

]);
