import { Avatar, Card, Rating, Stack, Typography } from "@mui/material";
export default function ReviewCard({ review }) {
  return (
    <Card sx={{ p: 3, height: "100%" }}>
      <Stack sx={{ alignItems: "center" }} direction="row" spacing={1.5}>
        <Avatar sx={{ bgcolor: "primary.main" }}>{review.name?.[0]}</Avatar>
        <Stack>
          <Typography sx={{ fontWeight: 650 }}>{review.name}</Typography>
          <Rating
            readOnly
            size="small"
            value={Number(review.rating)}
            precision={0.5}
          />
        </Stack>
      </Stack>
      <Typography
        color="textSecondary"
        sx={{ mt: 2, overflowWrap: "anywhere" }}
      >
        {review.comment}
      </Typography>
    </Card>
  );
}
