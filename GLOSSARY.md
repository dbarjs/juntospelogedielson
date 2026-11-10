# Juntos pelo Gedielson

A public PIX donation page for the "Juntos pelo Gedielson" campaign. A Payer enters an amount and gets a Charge to pay into the Default Account; the Operator manages Bank Accounts and reviews Charges.

## Language

### Money in

**Charge**:
A request for one specific amount, created on one Bank Account, to which it belongs for good, and shown to the Payer as a QR code and its Copia e Cola (PIX's _cobrança_). It is Pending until it is Paid, Expired or Cancelled.
_Avoid_: Transaction, order, invoice, donation

**txid**:
The identifier we give a Charge when creating it; the Provider and the Operator's banking app show it too.
_Avoid_: Charge id, transaction id

**Payment**:
The Pix transfer that settles a Charge. A Charge has at most one.
_Avoid_: Transaction, donation, transfer

**End-to-end id**:
The identifier PIX gives a Payment, shown on the Payer's receipt and the Operator's bank statement.
_Avoid_: Transaction id, receipt number

**Copia e Cola**:
The text form of a Charge's QR code, which the Payer pastes into their banking app instead of scanning.
_Avoid_: Pix code, BR Code, payload

### A Charge's status

**Pending**:
A Charge that can still be paid: no Payment yet, and its time to be paid hasn't run out.

**Paid**:
A Charge whose Payment has arrived. It stays Paid for good, whatever it was before.

**Expired**:
A Charge whose time to be paid ran out with no Payment. A Payment that turns up later still makes it Paid.
_Avoid_: Overdue, timed out

**Cancelled**:
A Charge its Provider removed before it was paid.
_Avoid_: Removed, deleted

### Receiving money

**Bank Account**:
An account at a Provider that receives Payments on one Pix Key, registered with the credentials needed to create Charges on it. A removed Bank Account never creates Charges again, but its Charges still name it.
_Avoid_: Wallet, receiver, integration

**Pix Key**:
The key (CPF/CNPJ, e-mail, phone or random) that a Bank Account's Charges are created on. Each Bank Account has exactly one, and it never changes.
_Avoid_: Chave, key, address

**Provider**:
The bank whose PIX API creates and tracks a Bank Account's Charges: Efí Bank or Inter (Inter Empresas).
_Avoid_: PSP, gateway, bank integration

**Default Account**:
The Bank Account that new Charges are created on. Exactly one Bank Account is the Default Account at a time.
_Avoid_: Main account, primary account

**Probe Charge**:
A _cobrança_ created on a Bank Account only to check its credentials and Pix Key, for R$ 1,00 and 60 seconds. It is never shown to anyone and is not one of the app's Charges.
_Avoid_: Test charge, verification charge

### People

**Payer**:
Anyone who opens the payment page and pays a Charge from their own banking app. We never ask who they are.
_Avoid_: Donor, customer, user

**Operator**:
The one person who signs in to manage Bank Accounts and review Charges.
_Avoid_: Admin, owner, user
