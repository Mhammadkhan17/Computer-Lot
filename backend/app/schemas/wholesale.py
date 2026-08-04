from pydantic import BaseModel, Field, field_validator


class WholesaleApplyRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    tax_registration_id: str | None = Field(default=None, max_length=100)

    @field_validator("company_name")
    @classmethod
    def company_name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Company name is required")
        return v

    @field_validator("tax_registration_id")
    @classmethod
    def tax_id_trim(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class WholesaleApplyResponse(BaseModel):
    status: str
