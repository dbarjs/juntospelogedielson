# Dynamic Charges, not static QR codes

Every Charge is created through the Default Account's Provider PIX API (a _cobrança imediata_) instead of being built locally as a static PIX QR code from the account's key. A static QR needs no bank credentials, but the system could never tell whether it was paid; a dynamic Charge has an expiry and a Paid or Expired outcome, which both the Payer's screen and the Operator's list depend on. The cost is holding each Bank Account's API credentials and client certificate, and integrating Efí and Inter separately.
