ALTER TABLE "events"
  ALTER COLUMN "preprinted_back_layout"
  SET DEFAULT '{
    "version": 2,
    "elements": [
      {"id":"booking-default","type":"bookingId","x":50,"y":25,"width":26,"fontSize":3.2,"fontFamily":"monospace","color":"#1a1a2e","fontWeight":"bold","textAlign":"center","background":true,"visible":true},
      {"id":"qr-default","type":"qr","x":50,"y":56,"width":19,"fontSize":3,"fontFamily":"monospace","color":"#1a1a2e","fontWeight":"normal","textAlign":"center","background":true,"visible":true},
      {"id":"serial-default","type":"serialNumber","x":50,"y":92,"width":20,"fontSize":2.2,"fontFamily":"monospace","color":"#1a1a2e","fontWeight":"bold","textAlign":"center","background":true,"visible":true}
    ]
  }'::jsonb;