from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.device_registry import DeviceInfo

# (id, name, manufacturer, model, suggested area)
APPLIANCES = [
    ("radiator_1", "Bedroom 1 radiator", "Atlantic", "Divali 1500W", "Bedroom 1"),
    ("radiator_2", "Bedroom 2 radiator", "Atlantic", "Divali 1500W", "Bedroom 2"),
    ("radiator_3", "Bedroom 3 radiator", "Atlantic", "Divali 1500W", "Bedroom 3"),
    ("radiator_4", "Office radiator", "Atlantic", "Divali 1500W", "Office"),
    ("dryer", "Dryer", "Bosch", "Serie 6 WQG24509FR", None),
    ("boiler", "Boiler", "Saunier Duval", "ThemaPlus Condens F25", "Utility room"),
    ("water_heater", "Water heater", "Thermor", "Duralis 200 L", "Utility room"),
]


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities(FakeTemperature(*a) for a in APPLIANCES)


class FakeTemperature(SensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Temperature"
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_native_value = 19.5
    _attr_should_poll = False

    def __init__(self, uid, name, manufacturer, model, area):
        self._attr_unique_id = uid
        self._attr_device_info = DeviceInfo(
            identifiers={("fake_appliances", uid)},
            name=name,
            manufacturer=manufacturer,
            model=model,
            suggested_area=area,
        )
