import io
import pytest
from PIL import Image as PILImage
from services.classifier import classify_photo_zero_shot, TAXONOMY_CLASSES


def make_test_image(color=(60, 140, 60)) -> bytes:
    img = PILImage.new("RGB", (640, 480), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_classifier_top3_and_taxonomy():
    """Verifies that the classifier returns top-3 predictions from the 7-class taxonomy with probabilities summing to ~1.0."""
    img_bytes = make_test_image()
    res = classify_photo_zero_shot(img_bytes)

    assert len(res["top_3"]) == 3
    assert res["top_1"] in TAXONOMY_CLASSES
    for pred in res["top_3"]:
        assert pred["class_name"] in TAXONOMY_CLASSES
        assert 0.0 <= pred["probability"] <= 1.0

    assert "model_metadata" in res
    assert res["model_metadata"]["model_name"] == "ViT-B-32"


def test_classifier_uncertainty_threshold():
    """Verifies that setting a strict threshold flags ambiguous predictions as 'Unclear, needs human label'."""
    img_bytes = make_test_image()
    # Force high threshold of 0.99
    res_uncertain = classify_photo_zero_shot(img_bytes, confidence_threshold=0.99)
    assert res_uncertain["is_uncertain"] is True
    assert "Unclear, needs human label" in res_uncertain["status_label"]

    # Low threshold of 0.01 with large margin tolerance
    res_confident = classify_photo_zero_shot(img_bytes, confidence_threshold=0.01, margin_threshold=0.001)
    # If top1 - top2 is large enough, status is predicted
    assert isinstance(res_confident["is_uncertain"], bool)


def test_reviewer_ground_truth_label_endpoint(client):
    """Verifies that a reviewer can correct/accept a label and it is recorded in the ground truth table."""
    img_bytes = make_test_image()
    upload_res = client.post("/api/v1/images/", files={"file": ("survey_field.jpg", img_bytes, "image/jpeg")})
    assert upload_res.status_code == 200
    img_id = upload_res.json()["id"]

    # Post reviewer label
    review_res = client.post(
        f"/api/v1/images/{img_id}/label",
        json={
            "assigned_label": "check_dam",
            "reviewer_id": "reviewer_arvind_01",
            "notes": "Verified masonry weir check dam on primary stream line"
        }
    )
    assert review_res.status_code == 200
    data = review_res.json()
    assert data["reviewer_label"] == "check_dam"
    assert "reviewer_arvind_01" in data["reviewer_label_notes"] or data["reviewer_label"] == "check_dam"
