from homeassistant.config_entries import ConfigFlow

from . import DOMAIN


class FakeAppliancesFlow(ConfigFlow, domain=DOMAIN):
    async def async_step_import(self, data):
        return self.async_create_entry(title="Fake appliances", data={})
