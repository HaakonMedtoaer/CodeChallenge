// Tier 2 — Single obvious bug, minimal framing.
// One clear runtime defect and nothing else wrong. Pattern recognition.
window.EXERCISES = (window.EXERCISES || []).concat([

{
  id: "t2-01", tier: 2,
  scenario: "Stock level check",
  ask: "Return 'ok' when stock is above 10, otherwise 'reorder'.",
  code: `def check_stock(item):
    level = item.get("stock")
    if level > 10:
        return "ok"
    return "reorder"

print(check_stock({"sku": "A1", "stock": 25}))
print(check_stock({"sku": "B2"}))`,
  key: {
    trace: [
      "First call: level is 25, and 25 > 10, so it returns 'ok' and prints it.",
      "Second call: there is no 'stock' key, so .get returns None with no error.",
      "Then `None > 10` is evaluated — and Python refuses to order None against an int.",
      "TypeError is raised. The second print never happens, and execution stops there.",
    ],
    runtime: {
      crashes: true,
      where: "`if level > 10` on the second call",
      why: "TypeError: '>' not supported between instances of 'NoneType' and 'int'. `.get()` returning None is not an error — comparing that None is.",
    },
    logic: { matches: false, note: "For items that do have stock it behaves correctly. It simply has no answer for an item where stock was never recorded, and crashes rather than deciding." },
    stakes: "One product missing a stock field takes down the whole reorder run — and it stops partway, so some items were already processed and some never will be.",
  },
  bugs: [
    { tag: "none-vs-zero", kind: "runtime", what: "`.get('stock')` returns None for a missing key, and None is then compared to a number." },
    { tag: "missing-none-check", kind: "runtime", what: "No guard between fetching the value and using it in an arithmetic comparison." },
  ],
},

{
  id: "t2-02", tier: 2,
  scenario: "Building up a tag list",
  ask: "Add a tag to the given list, or start a fresh list when none is passed.",
  code: `def add_tag(tag, tags=[]):
    tags.append(tag)
    return tags

print(add_tag("urgent"))
print(add_tag("billing"))
print(add_tag("new", ["existing"]))`,
  key: {
    trace: [
      "The default list is created once, when the function is defined — not on each call.",
      "First call with no list: 'urgent' is appended to that one default list. Prints ['urgent'].",
      "Second call with no list: the same default list is reused, so 'billing' joins 'urgent'. Prints ['urgent', 'billing'].",
      "Third call passes its own list, so the default is untouched. Prints ['existing', 'new'].",
    ],
    runtime: {
      crashes: false,
      where: null,
      why: "Nothing raises. Appending to a list is always legal — this defect is invisible to the interpreter.",
    },
    logic: {
      matches: false,
      note: "The ask says 'start a fresh list when none is passed'. It does not. Every call that omits the list gets the accumulated results of every previous such call.",
    },
    stakes: "This is the shape of bug that passes every test written against a single call and then leaks data between customers in production. The fix is `tags=None` plus `if tags is None: tags = []`.",
  },
  bugs: [
    { tag: "mutable-default-arg", kind: "runtime", what: "`tags=[]` is evaluated once at definition time and shared by every call that omits the argument." },
  ],
},

{
  id: "t2-03", tier: 2,
  scenario: "Averaging a set of scores",
  ask: "Return the mean of the scores.",
  code: `def average_score(scores):
    total = 0
    count = 0
    for score in scores:
        total += score
        count += 1
    return total / counts

print(average_score([80, 90, 100]))`,
  key: {
    trace: [
      "The loop runs fine: total reaches 270 and count reaches 3.",
      "Then the return line refers to `counts` — with an s — which was never defined.",
      "Python raises NameError at that point. Nothing is printed.",
    ],
    runtime: {
      crashes: true,
      where: "`return total / counts`",
      why: "NameError: name 'counts' is not defined. The loop variable is `count`; `counts` is a near-miss name that exists nowhere.",
    },
    logic: { matches: false, note: "The arithmetic it was aiming at is correct — sum over count is the mean. It never gets to compute it." },
    stakes: "This one is loud and immediate, which makes it the easy case. The dangerous version is a typo that happens to match another real variable in scope — then it runs and quietly returns the wrong number.",
  },
  bugs: [
    { tag: "wrong-variable", kind: "runtime", what: "`counts` is referenced where `count` was defined." },
  ],
},

{
  id: "t2-04", tier: 2,
  scenario: "Rendering a receipt",
  ask: "Produce a two-line receipt with the order id and the total.",
  code: `def build_receipt(order_id, total):
    header = "Receipt #" + order_id
    body = "Total: " + total
    return header + "\\n" + body

print(build_receipt(1042, 99.5))`,
  key: {
    trace: [
      "order_id arrives as the integer 1042, not a string.",
      "The very first line tries \"Receipt #\" + 1042.",
      "Python will not concatenate a str and an int, so it raises immediately.",
      "The second concatenation, which has the same problem with the float, is never reached.",
    ],
    runtime: {
      crashes: true,
      where: "`header = \"Receipt #\" + order_id`, the first line of the function",
      why: "TypeError: can only concatenate str (not \"int\") to str. Note the crash is on line one — the float on the next line would fail the same way but never gets its turn.",
    },
    logic: { matches: false, note: "The intended layout is right. The function simply assumes both arguments are already strings, and the caller passes numbers." },
    stakes: "Receipt and invoice rendering is exactly where numbers meet strings. Wrapping both in str() is the fix, and f-strings do it for you.",
  },
  bugs: [
    { tag: "type-mismatch", kind: "runtime", what: "Numeric arguments concatenated directly onto strings without conversion." },
  ],
},

{
  id: "t2-05", tier: 2,
  scenario: "Deriving initials from a name",
  ask: "Turn a full name into upper-case initials.",
  code: `def initials(full_name):
    parts = full_name.split(" ")
    return "".join(p[0].upper() for p in parts)

names = ["ada lovelace", None, "alan turing"]
for n in names:
    print(initials(n))`,
  key: {
    trace: [
      "'ada lovelace' splits into ['ada', 'lovelace'], first letters upper-cased and joined gives 'AL'. Printed.",
      "The next name is None, and None has no .split method.",
      "AttributeError is raised on the first line of the function.",
      "'alan turing' is never reached — the loop dies on the second iteration.",
    ],
    runtime: {
      crashes: true,
      where: "`full_name.split(\" \")` on the second iteration",
      why: "AttributeError: 'NoneType' object has no attribute 'split'. A None slipped into a list the function assumes is all strings.",
    },
    logic: { matches: false, note: "The initials logic itself is correct for well-formed input. There is no handling for a missing name." },
    stakes: "Partway through a batch is the worst place to stop: the first record was processed, the third never was, and nothing records which.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A method is called on a value that can be None, with no guard in front of it." },
  ],
},

{
  id: "t2-06", tier: 2,
  scenario: "Pairing up consecutive readings",
  ask: "Return each value paired with the one after it.",
  code: `def pair_consecutive(values):
    pairs = []
    for i in range(len(values)):
        pairs.append((values[i], values[i + 1]))
    return pairs

print(pair_consecutive([3, 7, 11, 15]))`,
  key: {
    trace: [
      "The list has 4 items, so range(4) gives i = 0, 1, 2, 3.",
      "i = 0: (3, 7). i = 1: (7, 11). i = 2: (11, 15). All fine.",
      "i = 3: values[3] is 15, but values[4] is past the end of the list.",
      "IndexError is raised on the final iteration. Nothing is returned or printed.",
    ],
    runtime: {
      crashes: true,
      where: "`values[i + 1]` on the last iteration",
      why: "IndexError: list index out of range. The loop runs to the last element, but the body reaches one element further.",
    },
    logic: { matches: false, note: "The first three pairs are the right ones. The loop bound is simply one too high — it should be `range(len(values) - 1)`." },
    stakes: "Classic off-by-one: correct for every element except the last, so it survives a casual read and any test with a short enough list that nobody checks the tail.",
  },
  bugs: [
    { tag: "off-by-one", kind: "runtime", what: "The loop iterates over every index while the body reads index + 1." },
  ],
},

{
  id: "t2-07", tier: 2,
  scenario: "Looking up a shipping rate",
  ask: "Return the rate for the given zone.",
  code: `RATES = {"domestic": 49, "nordic": 129, "eu": 199}

def shipping_cost(order):
    return RATES[order["zone"]]

orders = [{"id": 1, "zone": "domestic"}, {"id": 2, "zone": "us"}]
for o in orders:
    print(o["id"], shipping_cost(o))`,
  key: {
    trace: [
      "Order 1 has zone 'domestic', which is in RATES, so it prints 1 49.",
      "Order 2 has zone 'us', which is not a key in RATES.",
      "Square-bracket lookup on a missing key raises rather than returning anything.",
      "KeyError is raised and the loop stops.",
    ],
    runtime: {
      crashes: true,
      where: "`RATES[order[\"zone\"]]` for the second order",
      why: "KeyError: 'us'. Square brackets demand the key exist; `.get()` would have returned None instead, which would push the failure further downstream.",
    },
    logic: { matches: false, note: "For the three zones it knows about it is correct. It has no answer for any other zone and no fallback rate." },
    stakes: "Checkout fails outright for any destination outside the hard-coded list. Whether crashing or silently charging a wrong default is worse is a real design question — but silently returning None here would be worse, because the failure would surface as a wrong charge instead of an error.",
  },
  bugs: [
    { tag: "missing-none-check", kind: "runtime", what: "A dict is indexed with a value that is not guaranteed to be a key, and there is no default." },
  ],
},

{
  id: "t2-08", tier: 2,
  scenario: "Taking the last N readings",
  ask: "Return the final n readings from the list.",
  code: `def last_n(readings, n):
    out = []
    for i in range(len(readings) - n, len(readings) + 1):
        out.append(readings[i])
    return out

print(last_n([5, 8, 2, 9, 4], 3))`,
  key: {
    trace: [
      "len is 5 and n is 3, so the range is range(2, 6), giving i = 2, 3, 4, 5.",
      "i = 2, 3 and 4 append 2, 9 and 4 — the three the ask wanted.",
      "i = 5 is one past the last valid index, which is 4.",
      "IndexError is raised after the correct values were already collected.",
    ],
    runtime: {
      crashes: true,
      where: "`readings[i]` when i reaches 5",
      why: "IndexError: list index out of range. The upper bound should be len(readings), not len(readings) + 1 — range already excludes its endpoint.",
    },
    logic: { matches: false, note: "It selects the right starting point and would return exactly the right three values if the loop stopped one step earlier." },
    stakes: "The `+ 1` looks like it is compensating for range being exclusive. It is double-counting that exclusivity. Whenever you see an adjustment on a range bound, check whether it has already been made.",
  },
  bugs: [
    { tag: "off-by-one", kind: "runtime", what: "`len(readings) + 1` as the range end, when range's end is already exclusive." },
  ],
},

{
  id: "t2-09", tier: 2,
  scenario: "Working out a customer discount",
  ask: "Total the orders, and return 10% of that for gold-tier customers.",
  code: `def discount_for(customer, orders):
    total = 0
    for customer in orders:
        total += customer["amount"]
    if customer["tier"] == "gold":
        return total * 0.1
    return 0

print(discount_for({"tier": "gold"}, [{"amount": 50}, {"amount": 70}]))`,
  key: {
    trace: [
      "The loop variable is also named `customer`, so it overwrites the parameter on the first iteration.",
      "The totalling itself works: 50 + 70 = 120.",
      "After the loop, `customer` no longer refers to the person — it refers to the last order, {'amount': 70}.",
      "`customer['tier']` on that dict raises KeyError. The tier check never sees the real customer.",
    ],
    runtime: {
      crashes: true,
      where: "`if customer[\"tier\"] == \"gold\"`",
      why: "KeyError: 'tier'. The loop variable shadowed the parameter, and in Python a for-loop variable survives past the end of the loop.",
    },
    logic: { matches: false, note: "The total is right. The tier check is reading the wrong object entirely, and would be wrong even if the key happened to exist." },
    stakes: "Here it crashes, which is the lucky outcome. Had the order dicts happened to carry a 'tier' key, this would run clean and grant or deny discounts based on the last line item instead of the customer.",
  },
  bugs: [
    { tag: "wrong-variable", kind: "runtime", what: "The loop variable reuses the parameter name and clobbers it for the rest of the function." },
  ],
},

{
  id: "t2-10", tier: 2,
  scenario: "Flagging large orders",
  ask: "Return True when the quantity is over 100.",
  code: `def is_large_order(order):
    qty = order["qty"]
    if qty > 100:
        return True
    return False

print(is_large_order({"qty": "250"}))`,
  key: {
    trace: [
      "The key exists, so qty is fetched without trouble — but its value is the string '250', not the number 250.",
      "The comparison `'250' > 100` asks Python to order a str against an int.",
      "Python refuses and raises TypeError. Nothing is printed.",
    ],
    runtime: {
      crashes: true,
      where: "`if qty > 100`",
      why: "TypeError: '>' not supported between instances of 'str' and 'int'. Quoted digits in JSON or a CSV are strings, and they look exactly like numbers when you read the data.",
    },
    logic: { matches: false, note: "The threshold matches the ask. The function assumes a numeric quantity and never converts." },
    stakes: "Worth knowing the near-miss: `'250' > '100'` would not crash, because two strings compare fine — alphabetically. That version runs clean and gets the answer wrong, which is much harder to catch.",
  },
  bugs: [
    { tag: "type-mismatch", kind: "runtime", what: "A string that looks numeric is compared against an int with no conversion." },
  ],
},

]);
