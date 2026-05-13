const isCoordinateLikeText = (value) => {
  const text = String(value || "").trim()
  if (!text) return false
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)
}

const cleanText = (value) => String(value || "").trim()

export const formatOrderAddressWithLabels = (address) => {
  if (!address) return "Address not available"
  if (typeof address === "string") return cleanText(address) || "Address not available"
  if (typeof address !== "object") return "Address not available"

  const label = cleanText(address.label)
  const building = cleanText(address.buildingName || address.addressLine1)
  const floor = cleanText(address.floor)
  const street = cleanText(address.street || address.addressLine2)
  const area = cleanText(address.additionalDetails || address.area)
  const landmark = cleanText(address.landmark)
  const city = cleanText(address.city)
  const state = cleanText(address.state)
  const zipCode = cleanText(address.zipCode || address.postalCode || address.pincode)

  const parts = [
    { label: "Type", value: label },
    { label: "Building", value: building },
    { label: "Floor/Flat", value: floor },
    { label: "Street", value: street },
    { label: "Area", value: area },
    { label: "Landmark", value: landmark },
    { label: "City", value: city },
    { label: "State", value: state },
    { label: "Pincode", value: zipCode },
  ].filter(p => cleanText(p.value));

  const uniqueLabeledParts = [];
  parts.forEach(part => {
    const value = cleanText(part.value);
    const lowerValue = value.toLowerCase();
    const isDuplicate = uniqueLabeledParts.some(p => {
      const existingValue = cleanText(p.split(": ")[1]).toLowerCase();
      return existingValue.includes(lowerValue) || lowerValue.includes(existingValue);
    });
    if (!isDuplicate) {
      uniqueLabeledParts.push(`${part.label}: ${value}`);
    }
  });

  if (uniqueLabeledParts.length > 0) return uniqueLabeledParts.join(", ")

  const formatted = cleanText(address.formattedAddress)
  if (formatted && !isCoordinateLikeText(formatted)) return formatted

  const raw = cleanText(address.address)
  if (raw) return raw

  return "Address not available"
}

export const formatOrderAddressForMap = (address) => {
  if (!address) return ""
  if (typeof address === "string") return cleanText(address)
  if (typeof address !== "object") return ""

  const formatted = cleanText(address.formattedAddress)
  if (formatted && !isCoordinateLikeText(formatted)) return formatted

  const parts = [
    address.buildingName || address.addressLine1,
    address.floor,
    address.street || address.addressLine2,
    area,
    landmark,
    address.city,
    address.state,
    address.zipCode || address.postalCode || address.pincode,
  ].map(cleanText).filter(Boolean);

  // De-duplicate parts: only add a part if it's not already contained in the previous parts
  const uniqueParts = [];
  parts.forEach(part => {
    const lowerPart = part.toLowerCase();
    const isDuplicate = uniqueParts.some(p => p.toLowerCase().includes(lowerPart) || lowerPart.includes(p.toLowerCase()));
    if (!isDuplicate) {
      uniqueParts.push(part);
    }
  });

  return uniqueParts.join(", ");
}
